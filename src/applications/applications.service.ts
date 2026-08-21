import { Injectable } from '@nestjs/common';
import { ApplicationStatus, OrderApplication, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DomainException } from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { CursorPage } from '../common/pagination/pagination.dto';
import { decodeCursor, splitPage } from '../common/pagination/cursor.util';
import { OutboxService } from '../outbox/outbox.service';
import {
  AGGREGATE_TYPE_ORDER,
  NotificationEventType,
} from '../outbox/notification-event-type';
import { OrderEventsService } from '../orders/application/order-events.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ApplicationResponseDto } from './dto/application-response.dto';

const UNIQUE_VIOLATION = 'P2002';

type ApplicationWithWorker = OrderApplication & {
  worker: {
    name: string;
    avatarObjectKey: string | null;
    workerProfile: { rating: unknown } | null;
  };
};

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly orderEvents: OrderEventsService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    workerId: string,
    orderId: string,
    dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    await this.prisma.workerProfile.upsert({
      where: { userId: workerId },
      update: {},
      create: { userId: workerId },
    });

    const proposedTime = new Date(dto.proposedTime);

    let application: OrderApplication;
    try {
      application = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) {
          throw DomainException.notFound(
            ErrorCode.ORDER_NOT_FOUND,
            'Order not found',
          );
        }
        if (order.status !== 'OPEN') {
          throw DomainException.conflict(
            ErrorCode.APPLICATION_ORDER_NOT_OPEN,
            'Order is not open for applications',
          );
        }

        const created = await tx.orderApplication.create({
          data: {
            orderId,
            workerId,
            proposedPriceMinor: dto.proposedPriceMinor,
            proposedTime,
            message: dto.message,
          },
        });

        // Re-check inside the same transaction to close the race where the
        // order was selected between our first read and this insert.
        const refreshed = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
        });
        if (refreshed.status !== 'OPEN') {
          throw DomainException.conflict(
            ErrorCode.APPLICATION_ORDER_NOT_OPEN,
            'Order is not open for applications',
          );
        }

        await this.orderEvents.record(tx, {
          orderId,
          actorUserId: workerId,
          type: 'APPLICATION_CREATED',
          payload: { applicationId: created.id },
        });
        await this.outbox.enqueue(tx, {
          type: NotificationEventType.NEW_APPLICATION,
          aggregateType: AGGREGATE_TYPE_ORDER,
          aggregateId: orderId,
          payload: {
            userId: order.customerId,
            orderId,
            applicationId: created.id,
          },
        });

        return created;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_VIOLATION
      ) {
        throw DomainException.conflict(
          ErrorCode.APPLICATION_ALREADY_EXISTS,
          'You have already applied to this order',
        );
      }
      throw err;
    }

    return this.toDto(await this.findWithWorkerOrThrow(application.id));
  }

  async withdraw(
    workerId: string,
    applicationId: string,
  ): Promise<ApplicationResponseDto> {
    const application = await this.prisma.orderApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application) {
      throw DomainException.notFound(
        ErrorCode.APPLICATION_NOT_FOUND,
        'Application not found',
      );
    }
    if (application.workerId !== workerId) {
      throw DomainException.forbidden(
        ErrorCode.APPLICATION_NOT_OWNER,
        'Not your application',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE order_applications SET status = 'WITHDRAWN', "updatedAt" = now()
        WHERE id = ${applicationId} AND status = 'PENDING'
      `;
      if (affected === 0) {
        throw DomainException.conflict(
          ErrorCode.APPLICATION_NOT_PENDING,
          'Application is no longer pending',
        );
      }
      await this.orderEvents.record(tx, {
        orderId: application.orderId,
        actorUserId: workerId,
        type: 'APPLICATION_WITHDRAWN',
        payload: { applicationId },
      });
    });

    return this.toDto(await this.findWithWorkerOrThrow(applicationId));
  }

  async listForOrder(
    customerId: string,
    orderId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPage<ApplicationResponseDto>> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw DomainException.notFound(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
      );
    }
    if (order.customerId !== customerId) {
      throw DomainException.forbidden(
        ErrorCode.ORDER_NOT_OWNER,
        'Not the order owner',
      );
    }

    const rows = await this.prisma.orderApplication.findMany({
      where: { orderId },
      include: this.workerInclude(),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: decodeCursor(cursor) }, skip: 1 } : {}),
    });
    const { items, nextCursor } = splitPage(rows, limit);
    return new CursorPage(
      await Promise.all(items.map((a) => this.toDto(a))),
      nextCursor,
    );
  }

  async listMine(
    workerId: string,
    status: ApplicationStatus | undefined,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPage<ApplicationResponseDto>> {
    const rows = await this.prisma.orderApplication.findMany({
      where: { workerId, ...(status ? { status } : {}) },
      include: this.workerInclude(),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: decodeCursor(cursor) }, skip: 1 } : {}),
    });
    const { items, nextCursor } = splitPage(rows, limit);
    return new CursorPage(
      await Promise.all(items.map((a) => this.toDto(a))),
      nextCursor,
    );
  }

  private workerInclude() {
    return {
      worker: {
        select: {
          name: true,
          avatarObjectKey: true,
          workerProfile: { select: { rating: true } },
        },
      },
    } satisfies Prisma.OrderApplicationInclude;
  }

  private async findWithWorkerOrThrow(
    applicationId: string,
  ): Promise<ApplicationWithWorker> {
    return this.prisma.orderApplication.findUniqueOrThrow({
      where: { id: applicationId },
      include: this.workerInclude(),
    });
  }

  private async toDto(
    application: ApplicationWithWorker,
  ): Promise<ApplicationResponseDto> {
    const avatarUrl = application.worker.avatarObjectKey
      ? await this.storage.createDownloadUrl(application.worker.avatarObjectKey)
      : undefined;

    return {
      id: application.id,
      orderId: application.orderId,
      workerId: application.workerId,
      workerName: application.worker.name,
      workerAvatarUrl: avatarUrl,
      workerRating: Number(application.worker.workerProfile?.rating ?? 0),
      proposedPriceMinor: application.proposedPriceMinor,
      proposedTime: application.proposedTime,
      message: application.message ?? undefined,
      status: application.status,
      createdAt: application.createdAt,
    };
  }
}

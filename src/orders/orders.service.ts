import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order, OrderApplication, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PrismaTransactionClient } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { CategoriesService } from '../categories/categories.service';
import { DomainException } from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { CursorPage } from '../common/pagination/pagination.dto';
import { decodeCursor, splitPage } from '../common/pagination/cursor.util';
import { OutboxService } from '../outbox/outbox.service';
import {
  AGGREGATE_TYPE_ORDER,
  NotificationEventType,
} from '../outbox/notification-event-type';
import { OrderEventsService } from './application/order-events.service';
import { OrdersGeoRepository } from './infrastructure/orders-geo.repository';
import { assertTransitionAllowed } from './domain/order-transitions';
import { CreateOrderDto } from './dto/create-order.dto';
import { SearchOrdersQueryDto } from './dto/search-orders.query.dto';
import { OrderSummaryDto } from './dto/order-summary.dto';
import { OrderDetailDto } from './dto/order-detail.dto';

type OrderWithSelection = Order & {
  selectedApplication: OrderApplication | null;
};

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100; // ~1.1km precision
}

@Injectable()
export class OrdersService {
  private readonly ordersConfig: AppConfig['orders'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly geoRepo: OrdersGeoRepository,
    private readonly orderEvents: OrderEventsService,
    private readonly outbox: OutboxService,
    private readonly categories: CategoriesService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.ordersConfig = config.get('orders', { infer: true });
  }

  async createOrder(
    customerId: string,
    dto: CreateOrderDto,
  ): Promise<OrderDetailDto> {
    await this.categories.assertActive(dto.categoryId);
    const requiredAt = new Date(dto.requiredAt);
    if (
      Number.isNaN(requiredAt.getTime()) ||
      requiredAt.getTime() <= Date.now()
    ) {
      throw DomainException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'requiredAt must be a valid timestamp in the future',
      );
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          customerId,
          categoryId: dto.categoryId,
          title: dto.title,
          description: dto.description,
          initialPriceMinor: dto.initialPriceMinor,
          latitude: dto.latitude,
          longitude: dto.longitude,
          address: dto.address,
          requiredAt,
        },
      });
      await this.geoRepo.syncLocation(
        tx,
        created.id,
        dto.latitude,
        dto.longitude,
      );
      await this.orderEvents.record(tx, {
        orderId: created.id,
        actorUserId: customerId,
        type: 'ORDER_CREATED',
      });
      return created;
    });

    return this.toDetailDto(
      { ...order, selectedApplication: null },
      customerId,
    );
  }

  async getById(orderId: string, viewerId?: string): Promise<OrderDetailDto> {
    const order = await this.findOrThrow(this.prisma, orderId);
    return this.toDetailDto(order, viewerId);
  }

  async getMine(
    customerId: string,
    status: OrderStatus | undefined,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPage<OrderSummaryDto>> {
    const rows = await this.prisma.order.findMany({
      where: { customerId, ...(status ? { status } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: decodeCursor(cursor) }, skip: 1 } : {}),
    });
    const { items, nextCursor } = splitPage(rows, limit);
    return new CursorPage(
      items.map((o) => this.toSummaryDto(o)),
      nextCursor,
    );
  }

  async search(
    query: SearchOrdersQueryDto,
  ): Promise<{ items: OrderSummaryDto[]; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const status = query.status ?? OrderStatus.OPEN;

    if (query.lat !== undefined && query.lng !== undefined) {
      const radiusM = Math.min(
        query.radiusM ?? this.ordersConfig.defaultSearchRadiusM,
        this.ordersConfig.maxSearchRadiusM,
      );
      const rows = await this.geoRepo.searchNearby({
        lat: query.lat,
        lng: query.lng,
        radiusM,
        categoryId: query.categoryId,
        status,
        date: query.date ? new Date(query.date) : undefined,
        priceFromMinor: query.priceFromMinor,
        priceToMinor: query.priceToMinor,
        limit,
        offset: (page - 1) * limit,
      });
      const distanceById = new Map(rows.map((r) => [r.id, r.distanceM]));
      const orders = await this.prisma.order.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      const byId = new Map(orders.map((o) => [o.id, o]));
      const items = rows
        .map((r) => byId.get(r.id))
        .filter((o): o is Order => !!o)
        .map((o) => this.toSummaryDto(o, distanceById.get(o.id)));
      return { items, page, limit };
    }

    const orders = await this.prisma.order.findMany({
      where: {
        status,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.priceFromMinor !== undefined
          ? { initialPriceMinor: { gte: query.priceFromMinor } }
          : {}),
        ...(query.priceToMinor !== undefined
          ? { initialPriceMinor: { lte: query.priceToMinor } }
          : {}),
        ...(query.date
          ? {
              requiredAt: {
                gte: new Date(new Date(query.date).setUTCHours(0, 0, 0, 0)),
                lt: new Date(new Date(query.date).setUTCHours(24, 0, 0, 0)),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: orders.map((o) => this.toSummaryDto(o)), page, limit };
  }

  async selectApplication(
    orderId: string,
    customerId: string,
    applicationId: string,
  ): Promise<OrderDetailDto> {
    const order = await this.prisma.$transaction(async (tx) => {
      const order = await this.findOrThrow(tx, orderId);
      if (order.customerId !== customerId) {
        throw DomainException.forbidden(
          ErrorCode.ORDER_NOT_OWNER,
          'Not the order owner',
        );
      }
      assertTransitionAllowed(order.status, OrderStatus.ACCEPTED);

      const application = await tx.orderApplication.findUnique({
        where: { id: applicationId },
      });
      if (!application || application.orderId !== orderId) {
        throw DomainException.notFound(
          ErrorCode.APPLICATION_NOT_FOUND,
          'Application not found',
        );
      }
      if (application.status !== 'PENDING') {
        throw DomainException.conflict(
          ErrorCode.APPLICATION_NOT_PENDING,
          'Application is no longer pending',
        );
      }

      const affected = await tx.$executeRaw`
        UPDATE orders
        SET status = 'ACCEPTED',
            "selectedApplicationId" = ${applicationId},
            "agreedPriceMinor" = ${application.proposedPriceMinor},
            "agreedWorkTime" = ${application.proposedTime},
            "acceptedAt" = now(),
            "updatedAt" = now()
        WHERE id = ${orderId} AND status = 'OPEN'
      `;
      if (affected === 0) {
        throw DomainException.conflict(
          ErrorCode.ORDER_SELECTION_CONFLICT,
          'Order was already accepted or is no longer open',
        );
      }

      await tx.orderApplication.update({
        where: { id: applicationId },
        data: { status: 'ACCEPTED' },
      });

      const rejected = await tx.orderApplication.findMany({
        where: { orderId, status: 'PENDING', id: { not: applicationId } },
      });
      await tx.orderApplication.updateMany({
        where: { orderId, status: 'PENDING', id: { not: applicationId } },
        data: { status: 'REJECTED' },
      });

      await this.orderEvents.record(tx, {
        orderId,
        actorUserId: customerId,
        type: 'WORKER_SELECTED',
        payload: { applicationId, workerId: application.workerId },
      });
      await this.outbox.enqueue(tx, {
        type: NotificationEventType.WORKER_SELECTED,
        aggregateType: AGGREGATE_TYPE_ORDER,
        aggregateId: orderId,
        payload: { userId: application.workerId, orderId },
      });

      for (const app of rejected) {
        await this.orderEvents.record(tx, {
          orderId,
          actorUserId: customerId,
          type: 'APPLICATION_REJECTED',
          payload: { applicationId: app.id, workerId: app.workerId },
        });
        await this.outbox.enqueue(tx, {
          type: NotificationEventType.APPLICATION_REJECTED,
          aggregateType: AGGREGATE_TYPE_ORDER,
          aggregateId: orderId,
          payload: { userId: app.workerId, orderId },
        });
      }

      return this.findOrThrow(tx, orderId);
    });

    return this.toDetailDto(order, customerId);
  }

  async startOrder(orderId: string, workerId: string): Promise<OrderDetailDto> {
    const order = await this.prisma.$transaction(async (tx) => {
      const order = await this.findOrThrow(tx, orderId);
      if (order.selectedApplication?.workerId !== workerId) {
        throw DomainException.forbidden(
          ErrorCode.ORDER_NOT_SELECTED_WORKER,
          'Only the selected worker can start this order',
        );
      }
      assertTransitionAllowed(order.status, OrderStatus.IN_PROGRESS);

      const affected = await tx.$executeRaw`
        UPDATE orders SET status = 'IN_PROGRESS', "startedAt" = now(), "updatedAt" = now()
        WHERE id = ${orderId} AND status = 'ACCEPTED'
      `;
      if (affected === 0) {
        throw DomainException.conflict(
          ErrorCode.ORDER_INVALID_TRANSITION,
          'Order is no longer in an ACCEPTED state',
        );
      }

      await this.orderEvents.record(tx, {
        orderId,
        actorUserId: workerId,
        type: 'ORDER_STARTED',
      });
      await this.outbox.enqueue(tx, {
        type: NotificationEventType.ORDER_STARTED,
        aggregateType: AGGREGATE_TYPE_ORDER,
        aggregateId: orderId,
        payload: { userId: order.customerId, orderId },
      });

      return this.findOrThrow(tx, orderId);
    });

    return this.toDetailDto(order, workerId);
  }

  async submitWork(orderId: string, workerId: string): Promise<OrderDetailDto> {
    const order = await this.prisma.$transaction(async (tx) => {
      const order = await this.findOrThrow(tx, orderId);
      if (order.selectedApplication?.workerId !== workerId) {
        throw DomainException.forbidden(
          ErrorCode.ORDER_NOT_SELECTED_WORKER,
          'Only the selected worker can submit work for this order',
        );
      }
      assertTransitionAllowed(order.status, OrderStatus.WAITING_CONFIRMATION);

      const affected = await tx.$executeRaw`
        UPDATE orders SET status = 'WAITING_CONFIRMATION', "workSubmittedAt" = now(), "updatedAt" = now()
        WHERE id = ${orderId} AND status = 'IN_PROGRESS'
      `;
      if (affected === 0) {
        throw DomainException.conflict(
          ErrorCode.ORDER_INVALID_TRANSITION,
          'Order is no longer in progress',
        );
      }

      await tx.orderPhoto.updateMany({
        where: { orderId, type: 'WORKER_RESULT', status: 'PRIVATE' },
        data: { status: 'PENDING_CUSTOMER_APPROVAL' },
      });

      await this.orderEvents.record(tx, {
        orderId,
        actorUserId: workerId,
        type: 'WORK_SUBMITTED',
      });
      await this.outbox.enqueue(tx, {
        type: NotificationEventType.WORK_SUBMITTED,
        aggregateType: AGGREGATE_TYPE_ORDER,
        aggregateId: orderId,
        payload: { userId: order.customerId, orderId },
      });

      return this.findOrThrow(tx, orderId);
    });

    return this.toDetailDto(order, workerId);
  }

  async completeOrder(
    orderId: string,
    customerId: string,
    photoDecisions: { photoId: string; approve: boolean }[],
  ): Promise<OrderDetailDto> {
    const order = await this.prisma.$transaction(async (tx) => {
      const order = await this.findOrThrow(tx, orderId);
      if (order.customerId !== customerId) {
        throw DomainException.forbidden(
          ErrorCode.ORDER_NOT_OWNER,
          'Not the order owner',
        );
      }
      assertTransitionAllowed(order.status, OrderStatus.COMPLETED);

      const pendingPhotos = await tx.orderPhoto.findMany({
        where: {
          orderId,
          type: 'WORKER_RESULT',
          status: 'PENDING_CUSTOMER_APPROVAL',
        },
      });
      const pendingIds = new Set(pendingPhotos.map((p) => p.id));
      for (const decision of photoDecisions) {
        if (!pendingIds.has(decision.photoId)) {
          throw DomainException.badRequest(
            ErrorCode.PHOTO_NOT_FOUND,
            `Photo ${decision.photoId} is not pending approval for this order`,
          );
        }
      }
      const decisionByPhotoId = new Map(
        photoDecisions.map((d) => [d.photoId, d.approve]),
      );
      const approvedPhotoIds: string[] = [];
      for (const photo of pendingPhotos) {
        const approve = decisionByPhotoId.get(photo.id) ?? false;
        if (approve) approvedPhotoIds.push(photo.id);
        await tx.orderPhoto.update({
          where: { id: photo.id },
          data: {
            status: approve ? 'PUBLIC_PORTFOLIO' : 'PRIVATE',
            approvedAt: approve ? new Date() : null,
          },
        });
      }

      const affected = await tx.$executeRaw`
        UPDATE orders SET status = 'COMPLETED', "completedAt" = now(), "updatedAt" = now()
        WHERE id = ${orderId} AND status = 'WAITING_CONFIRMATION'
      `;
      if (affected === 0) {
        throw DomainException.conflict(
          ErrorCode.ORDER_INVALID_TRANSITION,
          'Order is not awaiting confirmation',
        );
      }

      if (order.selectedApplication) {
        await tx.workerProfile.update({
          where: { userId: order.selectedApplication.workerId },
          data: { completedOrdersCount: { increment: 1 } },
        });
      }
      await tx.customerProfile.update({
        where: { userId: customerId },
        data: { completedOrdersCount: { increment: 1 } },
      });

      await this.orderEvents.record(tx, {
        orderId,
        actorUserId: customerId,
        type: 'PORTFOLIO_PHOTOS_APPROVED',
        payload: { approvedPhotoIds },
      });
      await this.orderEvents.record(tx, {
        orderId,
        actorUserId: customerId,
        type: 'ORDER_COMPLETED',
      });
      if (order.selectedApplication) {
        await this.outbox.enqueue(tx, {
          type: NotificationEventType.ORDER_COMPLETED,
          aggregateType: AGGREGATE_TYPE_ORDER,
          aggregateId: orderId,
          payload: { userId: order.selectedApplication.workerId, orderId },
        });
      }

      return this.findOrThrow(tx, orderId);
    });

    return this.toDetailDto(order, customerId);
  }

  async cancel(
    orderId: string,
    actorId: string,
    reason: string | undefined,
  ): Promise<OrderDetailDto> {
    const order = await this.prisma.$transaction(async (tx) => {
      const order = await this.findOrThrow(tx, orderId);
      const isCustomer = order.customerId === actorId;
      const isSelectedWorker = order.selectedApplication?.workerId === actorId;
      if (!isCustomer && !isSelectedWorker) {
        throw DomainException.forbidden(
          ErrorCode.FORBIDDEN,
          'Not a participant of this order',
        );
      }

      if (order.status === OrderStatus.OPEN) {
        if (!isCustomer) {
          throw DomainException.forbidden(
            ErrorCode.FORBIDDEN,
            'Only the customer can cancel an open order',
          );
        }
      } else if (
        order.status === OrderStatus.ACCEPTED ||
        order.status === OrderStatus.IN_PROGRESS
      ) {
        if (!reason) {
          throw DomainException.badRequest(
            ErrorCode.ORDER_CANCEL_REASON_REQUIRED,
            'A cancellation reason is required at this stage',
          );
        }
      } else {
        throw DomainException.conflict(
          ErrorCode.ORDER_INVALID_TRANSITION,
          `Cannot cancel an order in status ${order.status}`,
        );
      }

      const affected = await tx.$executeRaw`
        UPDATE orders
        SET status = 'CANCELLED', "cancelledAt" = now(), "cancelReason" = ${reason ?? null}, "cancelledByUserId" = ${actorId}, "updatedAt" = now()
        WHERE id = ${orderId} AND status = ${order.status}::"OrderStatus"
      `;
      if (affected === 0) {
        throw DomainException.conflict(
          ErrorCode.ORDER_INVALID_TRANSITION,
          'Order status changed concurrently, cannot cancel',
        );
      }

      await this.orderEvents.record(tx, {
        orderId,
        actorUserId: actorId,
        type: 'ORDER_CANCELLED',
        payload: { reason },
      });
      const notifyUserId = isCustomer
        ? order.selectedApplication?.workerId
        : order.customerId;
      if (notifyUserId) {
        await this.outbox.enqueue(tx, {
          type: NotificationEventType.ORDER_CANCELLED,
          aggregateType: AGGREGATE_TYPE_ORDER,
          aggregateId: orderId,
          payload: { userId: notifyUserId, orderId },
        });
      }

      return this.findOrThrow(tx, orderId);
    });

    return this.toDetailDto(order, actorId);
  }

  private async findOrThrow(
    client: PrismaService | PrismaTransactionClient,
    orderId: string,
  ): Promise<OrderWithSelection> {
    const order = await client.order.findUnique({
      where: { id: orderId },
      include: { selectedApplication: true },
    });
    if (!order) {
      throw DomainException.notFound(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
      );
    }
    return order;
  }

  private toSummaryDto(order: Order, distanceM?: number): OrderSummaryDto {
    return {
      id: order.id,
      title: order.title,
      categoryId: order.categoryId,
      initialPriceMinor: order.initialPriceMinor,
      agreedPriceMinor: order.agreedPriceMinor ?? undefined,
      currency: order.currency,
      requiredAt: order.requiredAt,
      status: order.status,
      approxLatitude: roundCoordinate(order.latitude),
      approxLongitude: roundCoordinate(order.longitude),
      distanceM,
      createdAt: order.createdAt,
    };
  }

  private toDetailDto(
    order: OrderWithSelection,
    viewerId?: string,
  ): OrderDetailDto {
    const isOwnedByViewer = order.customerId === viewerId;
    const isSelectedWorker =
      !!viewerId && order.selectedApplication?.workerId === viewerId;
    const canSeeExactLocation = isOwnedByViewer || isSelectedWorker;

    return {
      ...this.toSummaryDto(order),
      description: order.description ?? undefined,
      exactLatitude: canSeeExactLocation ? order.latitude : undefined,
      exactLongitude: canSeeExactLocation ? order.longitude : undefined,
      address: canSeeExactLocation ? (order.address ?? undefined) : undefined,
      customerId: order.customerId,
      selectedApplicationId: order.selectedApplicationId ?? undefined,
      agreedWorkTime: order.agreedWorkTime ?? undefined,
      acceptedAt: order.acceptedAt ?? undefined,
      startedAt: order.startedAt ?? undefined,
      workSubmittedAt: order.workSubmittedAt ?? undefined,
      completedAt: order.completedAt ?? undefined,
      cancelledAt: order.cancelledAt ?? undefined,
      cancelReason: order.cancelReason ?? undefined,
      isOwnedByViewer,
      isSelectedWorker,
    };
  }
}

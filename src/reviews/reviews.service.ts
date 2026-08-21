import { Injectable } from '@nestjs/common';
import { Prisma, ReviewTargetRole } from '@prisma/client';
import type { PrismaTransactionClient } from '../prisma/prisma.service';
import { PrismaService } from '../prisma/prisma.service';
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
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewResponseDto } from './dto/review-response.dto';

const UNIQUE_VIOLATION = 'P2002';
/** Rating shown on a profile is the average of only the most recent reviews, not all-time. */
const RATING_WINDOW_SIZE = 50;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderEvents: OrderEventsService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    authorId: string,
    orderId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { selectedApplication: true },
    });
    if (!order) {
      throw DomainException.notFound(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
      );
    }
    if (order.status !== 'COMPLETED') {
      throw DomainException.conflict(
        ErrorCode.REVIEW_ORDER_NOT_COMPLETED,
        'Can only review completed orders',
      );
    }

    const workerId = order.selectedApplication?.workerId;
    let targetRole: ReviewTargetRole;
    let targetUserId: string;
    if (authorId === order.customerId && workerId) {
      targetRole = ReviewTargetRole.WORKER;
      targetUserId = workerId;
    } else if (authorId === workerId) {
      targetRole = ReviewTargetRole.CUSTOMER;
      targetUserId = order.customerId;
    } else {
      throw DomainException.forbidden(
        ErrorCode.REVIEW_NOT_PARTICIPANT,
        'Only order participants can leave a review',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            orderId,
            authorUserId: authorId,
            targetUserId,
            targetRole,
            rating: dto.rating,
            comment: dto.comment,
          },
        });

        await this.recalculateRating(tx, targetUserId, targetRole);

        await this.orderEvents.record(tx, {
          orderId,
          actorUserId: authorId,
          type: 'REVIEW_CREATED',
          payload: { reviewId: review.id, targetUserId, targetRole },
        });
        await this.outbox.enqueue(tx, {
          type: NotificationEventType.NEW_REVIEW,
          aggregateType: AGGREGATE_TYPE_ORDER,
          aggregateId: orderId,
          payload: { userId: targetUserId, orderId, reviewId: review.id },
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === UNIQUE_VIOLATION
      ) {
        throw DomainException.conflict(
          ErrorCode.REVIEW_ALREADY_EXISTS,
          'You have already reviewed this side of the order',
        );
      }
      throw err;
    }

    const created = await this.prisma.review.findFirstOrThrow({
      where: { orderId, authorUserId: authorId, targetRole },
      include: { author: { select: { name: true } } },
    });
    return this.toDto(created);
  }

  async listForTarget(
    targetUserId: string,
    targetRole: ReviewTargetRole,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPage<ReviewResponseDto>> {
    const rows = await this.prisma.review.findMany({
      where: { targetUserId, targetRole },
      include: { author: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: decodeCursor(cursor) }, skip: 1 } : {}),
    });
    const { items, nextCursor } = splitPage(rows, limit);
    return new CursorPage(
      items.map((r) => this.toDto(r)),
      nextCursor,
    );
  }

  private async recalculateRating(
    tx: PrismaTransactionClient,
    targetUserId: string,
    targetRole: ReviewTargetRole,
  ): Promise<void> {
    const recent = await tx.review.findMany({
      where: { targetUserId, targetRole },
      orderBy: { createdAt: 'desc' },
      take: RATING_WINDOW_SIZE,
      select: { rating: true },
    });
    const reviewsCount = recent.length;
    const average =
      reviewsCount === 0
        ? 0
        : recent.reduce((sum, r) => sum + r.rating, 0) / reviewsCount;
    const rating = Math.round(average * 100) / 100;

    if (targetRole === ReviewTargetRole.WORKER) {
      await tx.workerProfile.update({
        where: { userId: targetUserId },
        data: { rating, reviewsCount },
      });
    } else {
      await tx.customerProfile.update({
        where: { userId: targetUserId },
        data: { rating, reviewsCount },
      });
    }
  }

  private toDto(review: {
    id: string;
    orderId: string;
    authorUserId: string;
    author: { name: string };
    targetUserId: string;
    targetRole: ReviewTargetRole;
    rating: number;
    comment: string | null;
    createdAt: Date;
  }): ReviewResponseDto {
    return {
      id: review.id,
      orderId: review.orderId,
      authorUserId: review.authorUserId,
      authorName: review.author.name,
      targetUserId: review.targetUserId,
      targetRole: review.targetRole,
      rating: review.rating,
      comment: review.comment ?? undefined,
      createdAt: review.createdAt,
    };
  }
}

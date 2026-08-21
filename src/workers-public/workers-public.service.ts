import { Injectable } from '@nestjs/common';
import { ReviewTargetRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DomainException } from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { CursorPage } from '../common/pagination/pagination.dto';
import { decodeCursor, splitPage } from '../common/pagination/cursor.util';
import { ReviewsService } from '../reviews/reviews.service';
import { ReviewResponseDto } from '../reviews/dto/review-response.dto';
import { WorkerPublicProfileDto } from './dto/worker-public-profile.dto';
import { WorkerPortfolioPhotoDto } from './dto/worker-portfolio-photo.dto';
import { WorkerOrderHistoryItemDto } from './dto/worker-order-history-item.dto';

/** Portfolio photos are only ever drawn from the worker's most recent completed orders. */
const PORTFOLIO_ORDER_WINDOW = 50;

@Injectable()
export class WorkersPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly reviewsService: ReviewsService,
  ) {}

  async getProfile(workerId: string): Promise<WorkerPublicProfileDto> {
    const profile = await this.prisma.workerProfile.findUnique({
      where: { userId: workerId },
      include: { user: true, categories: { include: { category: true } } },
    });
    if (!profile) {
      throw DomainException.notFound(
        ErrorCode.WORKER_PROFILE_NOT_FOUND,
        'Worker not found',
      );
    }

    const avatarUrl = profile.user.avatarObjectKey
      ? await this.storage.createDownloadUrl(profile.user.avatarObjectKey)
      : undefined;

    return {
      id: profile.userId,
      name: profile.user.name,
      avatarUrl,
      description: profile.description ?? undefined,
      rating: Number(profile.rating),
      reviewsCount: profile.reviewsCount,
      completedOrdersCount: profile.completedOrdersCount,
      categories: profile.categories.map((c) => ({
        id: c.category.id,
        name: c.category.name,
      })),
    };
  }

  async getPortfolio(
    workerId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPage<WorkerPortfolioPhotoDto>> {
    const recentOrders = await this.prisma.order.findMany({
      where: { status: 'COMPLETED', selectedApplication: { workerId } },
      orderBy: { completedAt: 'desc' },
      take: PORTFOLIO_ORDER_WINDOW,
      select: { id: true },
    });
    const orderIds = recentOrders.map((o) => o.id);
    if (orderIds.length === 0) return new CursorPage([], null);

    const rows = await this.prisma.orderPhoto.findMany({
      where: {
        orderId: { in: orderIds },
        type: 'WORKER_RESULT',
        status: 'PUBLIC_PORTFOLIO',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: decodeCursor(cursor) }, skip: 1 } : {}),
    });
    const { items, nextCursor } = splitPage(rows, limit);
    const dtos = await Promise.all(
      items.map(async (p) => ({
        photoId: p.id,
        orderId: p.orderId,
        url: await this.storage.createDownloadUrl(p.objectKey),
        createdAt: p.createdAt,
      })),
    );
    return new CursorPage(dtos, nextCursor);
  }

  async getOrderHistory(
    workerId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPage<WorkerOrderHistoryItemDto>> {
    const rows = await this.prisma.order.findMany({
      where: { status: 'COMPLETED', selectedApplication: { workerId } },
      include: {
        category: true,
        reviews: {
          where: { targetRole: ReviewTargetRole.WORKER },
          select: { rating: true },
        },
        photos: {
          where: { type: 'WORKER_RESULT', status: 'PUBLIC_PORTFOLIO' },
        },
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: decodeCursor(cursor) }, skip: 1 } : {}),
    });
    const { items, nextCursor } = splitPage(rows, limit);
    const dtos = await Promise.all(
      items.map(async (o) => ({
        orderId: o.id,
        categoryId: o.categoryId,
        categoryName: o.category.name,
        title: o.title,
        completedAt: o.completedAt as Date,
        rating: o.reviews[0]?.rating,
        publicPhotoUrls: await Promise.all(
          o.photos.map((p) => this.storage.createDownloadUrl(p.objectKey)),
        ),
      })),
    );
    return new CursorPage(dtos, nextCursor);
  }

  getReviews(
    workerId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPage<ReviewResponseDto>> {
    return this.reviewsService.listForTarget(
      workerId,
      ReviewTargetRole.WORKER,
      cursor,
      limit,
    );
  }
}

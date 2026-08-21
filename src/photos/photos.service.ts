import { Injectable } from '@nestjs/common';
import { OrderPhoto, PhotoType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MAX_IMAGE_SIZE_BYTES } from '../storage/allowed-image-types';
import { DomainException } from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { CursorPage } from '../common/pagination/pagination.dto';
import { decodeCursor, splitPage } from '../common/pagination/cursor.util';
import { OrderEventsService } from '../orders/application/order-events.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  AGGREGATE_TYPE_PHOTO,
  PHOTO_PROCESSING_EVENT_TYPE,
} from '../outbox/notification-event-type';
import { CreatePhotoUploadUrlDto } from './dto/create-photo-upload-url.dto';
import {
  PhotoResponseDto,
  PhotoUploadUrlResponseDto,
} from './dto/photo-response.dto';

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly orderEvents: OrderEventsService,
    private readonly outbox: OutboxService,
  ) {}

  async createUploadUrl(
    userId: string,
    orderId: string,
    dto: CreatePhotoUploadUrlDto,
  ): Promise<PhotoUploadUrlResponseDto> {
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

    if (dto.type === PhotoType.CUSTOMER_INPUT) {
      if (order.customerId !== userId) {
        throw DomainException.forbidden(
          ErrorCode.PHOTO_NOT_ALLOWED,
          'Not the order owner',
        );
      }
      if (order.status === 'CANCELLED' || order.status === 'COMPLETED') {
        throw DomainException.forbidden(
          ErrorCode.PHOTO_NOT_ALLOWED,
          'Order is no longer active',
        );
      }
    } else {
      if (order.selectedApplication?.workerId !== userId) {
        throw DomainException.forbidden(
          ErrorCode.PHOTO_NOT_ALLOWED,
          'Only the selected worker can upload result photos',
        );
      }
      if (order.status !== 'IN_PROGRESS') {
        throw DomainException.forbidden(
          ErrorCode.PHOTO_NOT_ALLOWED,
          'Order must be in progress to upload result photos',
        );
      }
    }

    const photoId = randomUUID();
    const objectKey = `orders/${orderId}/photos/${photoId}`;

    await this.prisma.orderPhoto.create({
      data: {
        id: photoId,
        orderId,
        uploadedByUserId: userId,
        type: dto.type,
        objectKey,
        contentType: dto.contentType,
        status: 'PENDING_UPLOAD',
      },
    });

    const { url, expiresAt } = await this.storage.createUploadUrl(
      objectKey,
      dto.contentType,
    );
    return { photoId, objectKey, uploadUrl: url, expiresAt };
  }

  async completeUpload(
    userId: string,
    photoId: string,
  ): Promise<PhotoResponseDto> {
    const photo = await this.prisma.orderPhoto.findUnique({
      where: { id: photoId },
    });
    if (!photo) {
      throw DomainException.notFound(
        ErrorCode.PHOTO_NOT_FOUND,
        'Photo not found',
      );
    }
    if (photo.uploadedByUserId !== userId) {
      throw DomainException.forbidden(
        ErrorCode.PHOTO_NOT_ALLOWED,
        'Not your photo upload',
      );
    }
    if (photo.status !== 'PENDING_UPLOAD') {
      throw DomainException.conflict(
        ErrorCode.PHOTO_ALREADY_COMPLETED,
        'This upload has already been completed',
      );
    }

    const meta = await this.storage.headObject(photo.objectKey);
    if (!meta) {
      throw DomainException.badRequest(
        ErrorCode.PHOTO_NOT_UPLOADED,
        'Object was not found in storage yet',
      );
    }
    if (meta.sizeBytes > MAX_IMAGE_SIZE_BYTES) {
      await this.storage.deleteObject(photo.objectKey);
      throw DomainException.badRequest(
        ErrorCode.PHOTO_TOO_LARGE,
        'Uploaded file exceeds the size limit',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.orderPhoto.update({
        where: { id: photoId },
        data: { status: 'PRIVATE' },
      });
      await this.orderEvents.record(tx, {
        orderId: photo.orderId,
        actorUserId: userId,
        type: 'PHOTO_UPLOADED',
        payload: { photoId, type: photo.type },
      });
      await this.outbox.enqueue(tx, {
        type: PHOTO_PROCESSING_EVENT_TYPE,
        aggregateType: AGGREGATE_TYPE_PHOTO,
        aggregateId: photoId,
        payload: { photoId, objectKey: photo.objectKey },
      });
      return result;
    });

    return this.toDto(updated, true);
  }

  async listForOrder(
    userId: string,
    orderId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<CursorPage<PhotoResponseDto>> {
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
    const isParticipant =
      order.customerId === userId ||
      order.selectedApplication?.workerId === userId;
    if (!isParticipant) {
      throw DomainException.forbidden(
        ErrorCode.PHOTO_NOT_ALLOWED,
        'Not a participant of this order',
      );
    }

    const rows = await this.prisma.orderPhoto.findMany({
      where: { orderId, status: { not: 'PENDING_UPLOAD' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: decodeCursor(cursor) }, skip: 1 } : {}),
    });
    const { items, nextCursor } = splitPage(rows, limit);
    return new CursorPage(
      await Promise.all(items.map((p) => this.toDto(p, true))),
      nextCursor,
    );
  }

  private async toDto(
    photo: OrderPhoto,
    withUrl: boolean,
  ): Promise<PhotoResponseDto> {
    const url =
      withUrl && photo.status !== 'PENDING_UPLOAD'
        ? await this.storage.createDownloadUrl(photo.objectKey)
        : undefined;
    return {
      id: photo.id,
      orderId: photo.orderId,
      type: photo.type,
      status: photo.status,
      url,
      createdAt: photo.createdAt,
    };
  }
}

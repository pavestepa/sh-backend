import { Injectable } from '@nestjs/common';
import { UserMode } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DomainException } from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { MeResponseDto } from './dto/me-response.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getMe(userId: string): Promise<MeResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customerProfile: true, workerProfile: true },
    });
    if (!user) {
      throw DomainException.notFound(
        ErrorCode.USER_NOT_FOUND,
        'User not found',
      );
    }
    return this.toMeResponse(user);
  }

  async updateMe(
    userId: string,
    name: string | undefined,
  ): Promise<MeResponseDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: name !== undefined ? { name } : {},
      include: { customerProfile: true, workerProfile: true },
    });
    return this.toMeResponse(user);
  }

  async switchMode(userId: string, mode: UserMode): Promise<MeResponseDto> {
    if (mode === UserMode.WORKER) {
      await this.prisma.workerProfile.upsert({
        where: { userId },
        update: {},
        create: { userId },
      });
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { activeMode: mode },
      include: { customerProfile: true, workerProfile: true },
    });
    return this.toMeResponse(user);
  }

  async createAvatarUploadUrl(userId: string, contentType: string) {
    const objectKey = `avatars/${userId}/${randomUUID()}`;
    const { url, expiresAt } = await this.storage.createUploadUrl(
      objectKey,
      contentType,
    );
    return { objectKey, uploadUrl: url, expiresAt };
  }

  async completeAvatarUpload(
    userId: string,
    objectKey: string,
  ): Promise<MeResponseDto> {
    if (!objectKey.startsWith(`avatars/${userId}/`)) {
      throw DomainException.forbidden(
        ErrorCode.FORBIDDEN,
        'Object key does not belong to this user',
      );
    }
    const meta = await this.storage.headObject(objectKey);
    if (!meta) {
      throw DomainException.badRequest(
        ErrorCode.PHOTO_NOT_UPLOADED,
        'Object was not found in storage yet',
      );
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarObjectKey: objectKey },
      include: { customerProfile: true, workerProfile: true },
    });
    return this.toMeResponse(user);
  }

  private async toMeResponse(user: {
    id: string;
    phone: string;
    name: string;
    avatarObjectKey: string | null;
    activeMode: UserMode;
    createdAt: Date;
    customerProfile: {
      rating: unknown;
      reviewsCount: number;
      completedOrdersCount: number;
    } | null;
    workerProfile: {
      rating: unknown;
      reviewsCount: number;
      completedOrdersCount: number;
    } | null;
  }): Promise<MeResponseDto> {
    const avatarUrl = user.avatarObjectKey
      ? await this.storage.createDownloadUrl(user.avatarObjectKey)
      : undefined;

    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      avatarUrl,
      activeMode: user.activeMode,
      createdAt: user.createdAt,
      customerProfile: {
        rating: Number(user.customerProfile?.rating ?? 0),
        reviewsCount: user.customerProfile?.reviewsCount ?? 0,
        completedOrdersCount: user.customerProfile?.completedOrdersCount ?? 0,
      },
      workerProfile: user.workerProfile
        ? {
            rating: Number(user.workerProfile.rating),
            reviewsCount: user.workerProfile.reviewsCount,
            completedOrdersCount: user.workerProfile.completedOrdersCount,
          }
        : undefined,
    };
  }
}

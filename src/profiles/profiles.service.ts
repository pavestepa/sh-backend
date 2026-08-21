import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { MyWorkerProfileDto } from './dto/my-worker-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async getMyWorkerProfile(userId: string): Promise<MyWorkerProfileDto> {
    const profile = await this.ensureWorkerProfile(userId);
    return this.toDto(profile.userId);
  }

  async updateDescription(
    userId: string,
    description: string | undefined,
  ): Promise<MyWorkerProfileDto> {
    await this.ensureWorkerProfile(userId);
    await this.prisma.workerProfile.update({
      where: { userId },
      data: description !== undefined ? { description } : {},
    });
    return this.toDto(userId);
  }

  async updateCategories(
    userId: string,
    categoryIds: string[],
  ): Promise<MyWorkerProfileDto> {
    await this.ensureWorkerProfile(userId);
    for (const categoryId of categoryIds) {
      await this.categoriesService.assertActive(categoryId);
    }

    await this.prisma.$transaction([
      this.prisma.workerCategory.deleteMany({ where: { workerId: userId } }),
      this.prisma.workerCategory.createMany({
        data: categoryIds.map((categoryId) => ({
          workerId: userId,
          categoryId,
        })),
      }),
    ]);

    return this.toDto(userId);
  }

  private async ensureWorkerProfile(userId: string) {
    return this.prisma.workerProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  private async toDto(userId: string): Promise<MyWorkerProfileDto> {
    const profile = await this.prisma.workerProfile.findUniqueOrThrow({
      where: { userId },
      include: { categories: true },
    });
    return {
      description: profile.description ?? undefined,
      rating: Number(profile.rating),
      reviewsCount: profile.reviewsCount,
      completedOrdersCount: profile.completedOrdersCount,
      categoryIds: profile.categories.map((c) => c.categoryId),
    };
  }
}

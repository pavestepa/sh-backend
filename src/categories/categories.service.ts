import { Injectable } from '@nestjs/common';
import { Category } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainException } from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { CategoryNodeDto } from './dto/category-node.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async getTree(): Promise<CategoryNodeDto[]> {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return this.buildTree(categories, null);
  }

  /** Throws if the category doesn't exist or is inactive. Used by Orders/Profiles before assigning a category. */
  async assertActive(categoryId: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw DomainException.notFound(
        ErrorCode.CATEGORY_NOT_FOUND,
        'Category not found',
      );
    }
    if (!category.isActive) {
      throw DomainException.badRequest(
        ErrorCode.CATEGORY_INACTIVE,
        'Category is not active',
      );
    }
    return category;
  }

  private buildTree(
    categories: Category[],
    parentId: string | null,
  ): CategoryNodeDto[] {
    return categories
      .filter((c) => c.parentId === parentId)
      .map((c) => ({
        id: c.id,
        name: c.name,
        children: this.buildTree(categories, c.id),
      }));
  }
}

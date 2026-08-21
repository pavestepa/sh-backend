import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WorkerCategoryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class WorkerPublicProfileDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  rating: number;

  @ApiProperty()
  reviewsCount: number;

  @ApiProperty()
  completedOrdersCount: number;

  @ApiProperty({ type: [WorkerCategoryDto] })
  categories: WorkerCategoryDto[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MyWorkerProfileDto {
  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  rating: number;

  @ApiProperty()
  reviewsCount: number;

  @ApiProperty()
  completedOrdersCount: number;

  @ApiProperty({ type: [String] })
  categoryIds: string[];
}

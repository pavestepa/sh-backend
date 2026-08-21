import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Privacy-safe view of a completed order for a worker's public history.
 * Deliberately excludes customer identity, phone, exact address, and
 * coordinates — see OrdersService.toDetailDto for the internal shape this
 * is derived from.
 */
export class WorkerOrderHistoryItemDto {
  @ApiProperty()
  orderId: string;

  @ApiProperty()
  categoryId: string;

  @ApiProperty()
  categoryName: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  completedAt: Date;

  @ApiPropertyOptional({
    description: 'Rating the customer gave the worker for this order, if any',
  })
  rating?: number;

  @ApiProperty({ type: [String] })
  publicPhotoUrls: string[];
}

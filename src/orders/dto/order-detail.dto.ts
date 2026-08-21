import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderSummaryDto } from './order-summary.dto';

export class OrderDetailDto extends OrderSummaryDto {
  @ApiPropertyOptional()
  description?: string;

  /** Only populated for the customer, or the selected worker once ACCEPTED. */
  @ApiPropertyOptional()
  exactLatitude?: number;

  @ApiPropertyOptional()
  exactLongitude?: number;

  @ApiPropertyOptional()
  address?: string;

  @ApiProperty()
  customerId: string;

  @ApiPropertyOptional()
  selectedApplicationId?: string;

  @ApiPropertyOptional()
  agreedWorkTime?: Date;

  @ApiPropertyOptional()
  acceptedAt?: Date;

  @ApiPropertyOptional()
  startedAt?: Date;

  @ApiPropertyOptional()
  workSubmittedAt?: Date;

  @ApiPropertyOptional()
  completedAt?: Date;

  @ApiPropertyOptional()
  cancelledAt?: Date;

  @ApiPropertyOptional()
  cancelReason?: string;

  @ApiProperty()
  isOwnedByViewer: boolean;

  @ApiProperty()
  isSelectedWorker: boolean;
}

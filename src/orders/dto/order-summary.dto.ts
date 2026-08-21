import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';

export class OrderSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  categoryId: string;

  @ApiProperty()
  initialPriceMinor: number;

  @ApiPropertyOptional()
  agreedPriceMinor?: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  requiredAt: Date;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  /** Rounded to ~1km precision unless the viewer is a participant. */
  @ApiProperty()
  approxLatitude: number;

  @ApiProperty()
  approxLongitude: number;

  @ApiPropertyOptional({
    description:
      'Meters from the search origin, only present for geo search results',
  })
  distanceM?: number;

  @ApiProperty()
  createdAt: Date;
}

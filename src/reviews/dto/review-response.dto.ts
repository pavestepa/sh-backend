import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReviewTargetRole } from '@prisma/client';

export class ReviewResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderId: string;

  @ApiProperty()
  authorUserId: string;

  @ApiProperty()
  authorName: string;

  @ApiProperty()
  targetUserId: string;

  @ApiProperty({ enum: ReviewTargetRole })
  targetRole: ReviewTargetRole;

  @ApiProperty()
  rating: number;

  @ApiPropertyOptional()
  comment?: string;

  @ApiProperty()
  createdAt: Date;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserMode } from '@prisma/client';

export class ProfileSummaryDto {
  @ApiProperty()
  rating: number;

  @ApiProperty()
  reviewsCount: number;

  @ApiProperty()
  completedOrdersCount: number;
}

export class MeResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  avatarUrl?: string;

  @ApiProperty({ enum: UserMode })
  activeMode: UserMode;

  @ApiProperty({ type: ProfileSummaryDto })
  customerProfile: ProfileSummaryDto;

  @ApiPropertyOptional({ type: ProfileSummaryDto })
  workerProfile?: ProfileSummaryDto;

  @ApiProperty()
  createdAt: Date;
}

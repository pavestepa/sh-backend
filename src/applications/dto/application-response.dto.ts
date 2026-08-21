import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';

export class ApplicationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderId: string;

  @ApiProperty()
  workerId: string;

  @ApiProperty()
  workerName: string;

  @ApiPropertyOptional()
  workerAvatarUrl?: string;

  @ApiProperty()
  workerRating: number;

  @ApiProperty()
  proposedPriceMinor: number;

  @ApiProperty()
  proposedTime: Date;

  @ApiPropertyOptional()
  message?: string;

  @ApiProperty({ enum: ApplicationStatus })
  status: ApplicationStatus;

  @ApiProperty()
  createdAt: Date;
}

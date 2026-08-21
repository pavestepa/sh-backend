import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PhotoStatus, PhotoType } from '@prisma/client';

export class PhotoUploadUrlResponseDto {
  @ApiProperty()
  photoId: string;

  @ApiProperty()
  objectKey: string;

  @ApiProperty()
  uploadUrl: string;

  @ApiProperty()
  expiresAt: Date;
}

export class PhotoResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  orderId: string;

  @ApiProperty({ enum: PhotoType })
  type: PhotoType;

  @ApiProperty({ enum: PhotoStatus })
  status: PhotoStatus;

  @ApiPropertyOptional({
    description: 'Signed GET URL, present once the upload is confirmed',
  })
  url?: string;

  @ApiProperty()
  createdAt: Date;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { PhotoType } from '@prisma/client';
import { ALLOWED_IMAGE_CONTENT_TYPES } from '../../storage/allowed-image-types';

export class CreatePhotoUploadUrlDto {
  @ApiProperty({ enum: PhotoType })
  @IsIn([PhotoType.CUSTOMER_INPUT, PhotoType.WORKER_RESULT])
  type: PhotoType;

  @ApiProperty({ enum: ALLOWED_IMAGE_CONTENT_TYPES })
  @IsIn(ALLOWED_IMAGE_CONTENT_TYPES)
  contentType: string;
}

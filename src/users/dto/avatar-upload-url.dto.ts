import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';
import { ALLOWED_IMAGE_CONTENT_TYPES } from '../../storage/allowed-image-types';

export class CreateAvatarUploadUrlDto {
  @ApiProperty({ enum: ALLOWED_IMAGE_CONTENT_TYPES })
  @IsIn(ALLOWED_IMAGE_CONTENT_TYPES)
  contentType: string;
}

export class CompleteAvatarUploadDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  objectKey: string;
}

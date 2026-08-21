import { Controller, Get, Param, Post, Query, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CursorPaginationQuery } from '../common/pagination/pagination.dto';
import { PhotosService } from './photos.service';
import { CreatePhotoUploadUrlDto } from './dto/create-photo-upload-url.dto';

@ApiBearerAuth()
@ApiTags('photos')
@Controller('orders/:orderId/photos')
export class OrderPhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Post('upload-url')
  createUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: CreatePhotoUploadUrlDto,
  ) {
    return this.photosService.createUploadUrl(user.userId, orderId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Query() pagination: CursorPaginationQuery,
  ) {
    return this.photosService.listForOrder(
      user.userId,
      orderId,
      pagination.cursor,
      pagination.limit ?? 20,
    );
  }
}

@ApiBearerAuth()
@ApiTags('photos')
@Controller('photos')
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Post(':photoId/complete')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('photoId') photoId: string,
  ) {
    return this.photosService.completeUpload(user.userId, photoId);
  }
}

import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { OrderPhotosController, PhotosController } from './photos.controller';
import { PhotosService } from './photos.service';

@Module({
  imports: [OrdersModule],
  controllers: [OrderPhotosController, PhotosController],
  providers: [PhotosService],
  exports: [PhotosService],
})
export class PhotosModule {}

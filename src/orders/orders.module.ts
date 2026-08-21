import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderEventsService } from './application/order-events.service';
import { OrdersGeoRepository } from './infrastructure/orders-geo.repository';

@Module({
  imports: [CategoriesModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderEventsService, OrdersGeoRepository],
  exports: [OrdersService, OrderEventsService],
})
export class OrdersModule {}

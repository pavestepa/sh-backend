import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ApplicationsController } from './applications.controller';
import { OrderApplicationsController } from './order-applications.controller';
import { ApplicationsService } from './applications.service';

@Module({
  imports: [OrdersModule],
  controllers: [OrderApplicationsController, ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}

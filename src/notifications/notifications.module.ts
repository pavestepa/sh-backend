import { Module } from '@nestjs/common';
import { PushDevicesController } from './push-devices.controller';
import { NotificationsService } from './notifications.service';
import { LoggingNotificationProvider } from './logging-notification.provider';
import { NOTIFICATION_PROVIDER } from './notification-provider.interface';

@Module({
  controllers: [PushDevicesController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_PROVIDER, useClass: LoggingNotificationProvider },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}

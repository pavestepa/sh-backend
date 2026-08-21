import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PgBossService } from './pg-boss.service';
import { OutboxProcessorService } from './outbox-processor.service';
import { OrderReminderService } from './order-reminder.service';
import { CleanupService } from './cleanup.service';
import { PhotoProcessingService } from './photo-processing.service';
import { JobsBootstrapService } from './jobs-bootstrap.service';

@Module({
  imports: [OutboxModule, NotificationsModule],
  providers: [
    PgBossService,
    OutboxProcessorService,
    OrderReminderService,
    CleanupService,
    PhotoProcessingService,
    JobsBootstrapService,
  ],
})
export class JobsModule {}

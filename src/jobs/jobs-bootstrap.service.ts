import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PgBossService } from './pg-boss.service';
import { OutboxProcessorService } from './outbox-processor.service';
import { OrderReminderService } from './order-reminder.service';
import { CleanupService } from './cleanup.service';
import { PhotoProcessingService } from './photo-processing.service';
import { JobName } from './job-names';

interface SendPushNotificationData {
  userId: string;
  sourceType: string;
  [key: string]: unknown;
}

interface PhotoProcessingData {
  photoId: string;
  objectKey: string;
}

/**
 * Registers every pg-boss worker handler and cron schedule. Runs once, in
 * the worker process only (see worker.module.ts) — the API process never
 * imports JobsModule.
 */
@Injectable()
export class JobsBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(JobsBootstrapService.name);

  constructor(
    private readonly pgBossService: PgBossService,
    private readonly outboxProcessor: OutboxProcessorService,
    private readonly orderReminder: OrderReminderService,
    private readonly cleanup: CleanupService,
    private readonly photoProcessing: PhotoProcessingService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    const boss = this.pgBossService.boss;

    await boss.work<SendPushNotificationData>(
      JobName.SEND_PUSH_NOTIFICATION,
      async (job) => {
        const { userId, sourceType, ...payload } = job.data;
        await this.notifications.sendToUser(userId, sourceType, payload);
      },
    );

    await boss.work<PhotoProcessingData>(
      JobName.PHOTO_PROCESSING,
      async (job) => {
        await this.photoProcessing.process(
          job.data.photoId,
          job.data.objectKey,
        );
      },
    );

    await boss.work(JobName.OUTBOX_PROCESSING, async () => {
      await this.outboxProcessor.processBatch();
    });

    await boss.work(JobName.ORDER_REMINDER, async () => {
      await this.orderReminder.scanAndQueueReminders();
    });

    await boss.work(JobName.CLEAN_EXPIRED_OTP, async () => {
      await this.cleanup.cleanExpiredOtpCodes();
    });

    await boss.work(JobName.CLEAN_EXPIRED_SESSIONS, async () => {
      await this.cleanup.cleanExpiredSessions();
    });

    // Every minute: drain the transactional outbox.
    await boss.schedule(JobName.OUTBOX_PROCESSING, '* * * * *');
    // Every 15 minutes: scan for upcoming work needing a reminder.
    await boss.schedule(JobName.ORDER_REMINDER, '*/15 * * * *');
    // Daily housekeeping.
    await boss.schedule(JobName.CLEAN_EXPIRED_OTP, '0 3 * * *');
    await boss.schedule(JobName.CLEAN_EXPIRED_SESSIONS, '0 3 * * *');

    this.logger.log('Job handlers and schedules registered');
  }
}

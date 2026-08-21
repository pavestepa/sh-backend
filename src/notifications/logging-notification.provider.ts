import { Injectable } from '@nestjs/common';
import { AppLogger } from '../common/logging/app-logger.service';
import type {
  NotificationProvider,
  PushTarget,
} from './notification-provider.interface';

/**
 * Development-only provider: logs the notification instead of calling
 * Expo/FCM/APNs. Swapping in a real provider means adding a class that
 * implements NotificationProvider and switching the binding in
 * NotificationsModule — nothing else depends on the concrete implementation.
 */
@Injectable()
export class LoggingNotificationProvider implements NotificationProvider {
  constructor(private readonly logger: AppLogger) {}

  send(
    target: PushTarget,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log('push_notification', {
      event,
      platform: target.platform,
      payload,
    });
    return Promise.resolve();
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from './sms-provider.interface';

/** Development-only provider: writes the SMS content to the log instead of sending it. Never enable in production. */
@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger('MockSmsProvider');

  send(phone: string, message: string): Promise<void> {
    this.logger.log(`[MOCK SMS] to=${phone} message="${message}"`);
    return Promise.resolve();
  }
}

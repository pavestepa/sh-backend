import { Module } from '@nestjs/common';
import { MockSmsProvider } from './mock-sms.provider';
import { SMS_PROVIDER } from './sms-provider.interface';

/**
 * Only a mock (log-writing) provider exists today. Wiring a real provider
 * (Twilio, SMS.ru, etc.) later means adding a class implementing
 * SmsProvider and switching this factory on config.smsProvider — nothing
 * else in the app depends on the concrete implementation.
 */
@Module({
  providers: [{ provide: SMS_PROVIDER, useClass: MockSmsProvider }],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}

import type { SmsProvider } from '../../src/auth/sms/sms-provider.interface';

/** Test double: captures the OTP sent to each phone instead of logging it, so specs can read it back directly. */
export class RecordingSmsProvider implements SmsProvider {
  private readonly codesByPhone = new Map<string, string>();

  send(phone: string, message: string): Promise<void> {
    const match = /code is (\d+)/.exec(message);
    if (match) this.codesByPhone.set(phone, match[1]);
    return Promise.resolve();
  }

  getLastCode(phone: string): string {
    const code = this.codesByPhone.get(phone);
    if (!code) throw new Error(`No OTP recorded for ${phone}`);
    return code;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { SmsProvider } from './sms-provider.js';

/** Development stand-in: prints the OTP code to the API console. */
@Injectable()
export class DevSmsProvider implements SmsProvider {
  private readonly logger = new Logger('DevSms');

  async sendOtp(phone: string, code: string): Promise<void> {
    this.logger.log(`OTP for ${phone}: ${code}`);
  }
}

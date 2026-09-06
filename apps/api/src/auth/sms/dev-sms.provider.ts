import { Injectable, Logger } from '@nestjs/common';
import { TextSmsProvider } from './sms-provider.js';

/** Development stand-in: prints messages to the API console instead of sending. */
@Injectable()
export class DevSmsProvider extends TextSmsProvider {
  private readonly logger = new Logger('DevSms');

  async sendText(phone: string, message: string): Promise<void> {
    this.logger.log(`SMS to ${phone}: ${message}`);
  }

  /** Kept as a one-liner so the code is easy to copy out of the dev console. */
  async sendOtp(phone: string, code: string): Promise<void> {
    this.logger.log(`OTP for ${phone}: ${code}`);
  }
}

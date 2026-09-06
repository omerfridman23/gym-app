import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SmsProvider } from './sms-provider.js';

export const TWILIO_ENV_KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
] as const;

@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  private readonly logger = new Logger(TwilioSmsProvider.name);

  constructor(private readonly config: ConfigService) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    const sid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.getOrThrow<string>('TWILIO_FROM_NUMBER');

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const body = new URLSearchParams({
      To: phone,
      From: from,
      Body: `קוד האימות שלך: ${code}`,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    } catch {
      this.logger.error(`Twilio request failed for ${phone}`);
      throw new InternalServerErrorException('שליחת הקוד נכשלה, נסו שוב');
    }

    if (!response.ok) {
      this.logger.error(`Twilio responded ${response.status} sending OTP to ${phone}`);
      throw new InternalServerErrorException('שליחת הקוד נכשלה, נסו שוב');
    }
  }
}

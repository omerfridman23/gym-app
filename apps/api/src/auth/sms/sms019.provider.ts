import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SmsProvider } from './sms-provider.js';

export const SMS019_ENV_KEYS = ['SMS_019_USERNAME', 'SMS_019_TOKEN', 'SMS_019_SOURCE'] as const;

const ENDPOINT = 'https://019sms.co.il/api';

/**
 * 019 SMS gateway (019sms.co.il). Sends the 6-digit code we generate over
 * their JSON API. See https://docs.019sms.co.il/sms/send-sms.html
 */
@Injectable()
export class Sms019Provider implements SmsProvider {
  private readonly logger = new Logger(Sms019Provider.name);

  constructor(private readonly config: ConfigService) {}

  /** 019 expects a local Israeli number (05XXXXXXXX), not E.164. */
  private toLocal(phone: string): string {
    return phone.startsWith('+972') ? `0${phone.slice(4)}` : phone;
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    const username = this.config.getOrThrow<string>('SMS_019_USERNAME');
    const token = this.config.getOrThrow<string>('SMS_019_TOKEN');
    const source = this.config.getOrThrow<string>('SMS_019_SOURCE');

    const payload = {
      sms: {
        user: { username },
        source,
        destinations: { phone: [{ _: this.toLocal(phone) }] },
        message: `קוד האימות שלך: ${code}`,
      },
    };

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch {
      this.logger.error(`019 request failed for ${phone}`);
      throw new InternalServerErrorException('שליחת הקוד נכשלה, נסו שוב');
    }

    if (!response.ok) {
      this.logger.error(`019 responded ${response.status} sending OTP to ${phone}`);
      throw new InternalServerErrorException('שליחת הקוד נכשלה, נסו שוב');
    }

    // 019 returns HTTP 200 even for logical failures; status 0 means accepted.
    const body = (await response.json().catch(() => null)) as { status?: number } | null;
    if (!body || body.status !== 0) {
      this.logger.error(`019 rejected OTP to ${phone} with status ${body?.status ?? 'unknown'}`);
      throw new InternalServerErrorException('שליחת הקוד נכשלה, נסו שוב');
    }
  }
}

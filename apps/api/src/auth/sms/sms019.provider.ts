import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsSendError, TextSmsProvider } from './sms-provider.js';

export const SMS019_ENV_KEYS = [
  'SMS_019_USERNAME',
  'SMS_019_TOKEN',
  'SMS_019_SOURCE',
] as const;

const ENDPOINT = 'https://019sms.co.il/api';

/**
 * 019 SMS gateway (019sms.co.il) over their JSON API.
 * See https://docs.019sms.co.il/sms/send-sms.html
 */
@Injectable()
export class Sms019Provider extends TextSmsProvider {
  private readonly logger = new Logger(Sms019Provider.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  /** 019 expects a local Israeli number (05XXXXXXXX), not E.164. */
  private toLocal(phone: string): string {
    return phone.startsWith('+972') ? `0${phone.slice(4)}` : phone;
  }

  async sendText(phone: string, message: string): Promise<void> {
    const username = this.config.getOrThrow<string>('SMS_019_USERNAME');
    const token = this.config.getOrThrow<string>('SMS_019_TOKEN');
    const source = this.config.getOrThrow<string>('SMS_019_SOURCE');

    const payload = {
      sms: {
        user: { username },
        source,
        destinations: { phone: [{ _: this.toLocal(phone) }] },
        message,
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
      // Message bodies stay out of the logs — they contain client names.
      this.logger.error(`019 request failed for ${phone}`);
      throw new SmsSendError('019 request failed');
    }

    if (!response.ok) {
      this.logger.error(`019 responded ${response.status} sending to ${phone}`);
      throw new SmsSendError(`019 responded ${response.status}`);
    }

    // 019 returns HTTP 200 even for logical failures; status 0 means accepted.
    const body = (await response.json().catch(() => null)) as {
      status?: number;
    } | null;
    if (!body || body.status !== 0) {
      const status = body?.status ?? 'unknown';
      this.logger.error(
        `019 rejected message to ${phone} with status ${status}`,
      );
      throw new SmsSendError(`019 rejected with status ${status}`);
    }
  }
}

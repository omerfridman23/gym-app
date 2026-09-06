import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SETTING_TWILIO_ACCOUNT_SID,
  SETTING_TWILIO_API_KEY,
  SETTING_TWILIO_API_SECRET,
  SETTING_TWILIO_FROM_NUMBER,
  SettingsService,
} from '../../settings/settings.service.js';
import { SmsSendError, TextSmsProvider } from './sms-provider.js';

export const TWILIO_ENV_KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY',
  'TWILIO_API_SECRET',
  'TWILIO_FROM_NUMBER',
] as const;

const SETTING_KEYS = [
  SETTING_TWILIO_ACCOUNT_SID,
  SETTING_TWILIO_API_KEY,
  SETTING_TWILIO_API_SECRET,
  SETTING_TWILIO_FROM_NUMBER,
];

interface TwilioCredentials {
  accountSid: string;
  apiKey: string;
  apiSecret: string;
  from: string;
}

@Injectable()
export class TwilioSmsProvider extends TextSmsProvider {
  private readonly logger = new Logger(TwilioSmsProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {
    super();
  }

  /**
   * Credentials come from the settings table first so they can be rotated
   * without a redeploy, falling back to env for bootstrap. Requests are signed
   * with an API key + secret rather than the account auth token: the key can be
   * revoked on its own, and it never grants full account access.
   */
  private async credentials(): Promise<TwilioCredentials> {
    const stored = await this.settings.getMany(SETTING_KEYS);
    const pick = (settingKey: string, envKey: string): string =>
      (stored[settingKey] || this.config.get<string>(envKey) || '').trim();

    const credentials: TwilioCredentials = {
      accountSid: pick(SETTING_TWILIO_ACCOUNT_SID, 'TWILIO_ACCOUNT_SID'),
      apiKey: pick(SETTING_TWILIO_API_KEY, 'TWILIO_API_KEY'),
      apiSecret: pick(SETTING_TWILIO_API_SECRET, 'TWILIO_API_SECRET'),
      from: pick(SETTING_TWILIO_FROM_NUMBER, 'TWILIO_FROM_NUMBER'),
    };

    const missing = Object.entries(credentials)
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length > 0) {
      // Names only — never the values.
      throw new SmsSendError(`Twilio is not configured: missing ${missing.join(', ')}`);
    }

    return credentials;
  }

  async sendText(phone: string, message: string): Promise<void> {
    const { accountSid, apiKey, apiSecret, from } = await this.credentials();

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const body = new URLSearchParams({ To: phone, From: from, Body: message });

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
      // Message bodies stay out of the logs — they contain client names.
      this.logger.error(`Twilio request failed for ${phone}`);
      throw new SmsSendError('Twilio request failed');
    }

    if (!response.ok) {
      this.logger.error(`Twilio responded ${response.status} sending to ${phone}`);
      throw new SmsSendError(`Twilio responded ${response.status}`);
    }
  }
}

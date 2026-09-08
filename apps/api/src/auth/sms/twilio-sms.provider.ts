import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SETTING_TWILIO_ACCOUNT_SID,
  SETTING_TWILIO_API_KEY,
  SETTING_TWILIO_API_SECRET,
  SETTING_TWILIO_VERIFY_SERVICE_SID,
  SETTING_TWILIO_WHATSAPP_FROM,
  SettingsService,
} from '../../settings/settings.service.js';
import { SmsSendError, TextSmsProvider } from './sms-provider.js';

export const TWILIO_ENV_KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY',
  'TWILIO_API_SECRET',
  'TWILIO_VERIFY_SERVICE_SID',
  'TWILIO_WHATSAPP_FROM',
] as const;

const SETTING_KEYS = [
  SETTING_TWILIO_ACCOUNT_SID,
  SETTING_TWILIO_API_KEY,
  SETTING_TWILIO_API_SECRET,
  SETTING_TWILIO_VERIFY_SERVICE_SID,
  SETTING_TWILIO_WHATSAPP_FROM,
];

function asWhatsApp(phone: string): string {
  const trimmed = phone.trim();
  return trimmed.startsWith('whatsapp:') ? trimmed : `whatsapp:${trimmed}`;
}

interface TwilioCredentials {
  accountSid: string;
  apiKey: string;
  apiSecret: string;
  verifyServiceSid: string;
  whatsappFrom: string;
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
      verifyServiceSid: pick(
        SETTING_TWILIO_VERIFY_SERVICE_SID,
        'TWILIO_VERIFY_SERVICE_SID',
      ),
      whatsappFrom: pick(SETTING_TWILIO_WHATSAPP_FROM, 'TWILIO_WHATSAPP_FROM'),
    };

    const missing = Object.entries({
      accountSid: credentials.accountSid,
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
    })
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length > 0) {
      // Names only — never the values.
      throw new SmsSendError(
        `Twilio is not configured: missing ${missing.join(', ')}`,
      );
    }

    return credentials;
  }

  /** Automatic training reminders use the app's WhatsApp Business sender. */
  async sendText(phone: string, message: string): Promise<void> {
    const credentials = await this.credentials();
    if (!credentials.whatsappFrom) {
      throw new SmsSendError('Twilio WhatsApp sender is not configured');
    }
    await this.sendMessage(
      credentials,
      asWhatsApp(phone),
      asWhatsApp(credentials.whatsappFrom),
      message,
    );
  }

  /** Twilio Verify generates and sends the login code; no rented number needed. */
  async sendOtp(phone: string, _code: string): Promise<void> {
    try {
      const credentials = await this.credentials();
      if (!credentials.verifyServiceSid) {
        throw new SmsSendError('Twilio Verify service is not configured');
      }
      await this.verifyRequest(
        credentials,
        `https://verify.twilio.com/v2/Services/${credentials.verifyServiceSid}/Verifications`,
        { To: phone, Channel: 'sms' },
      );
    } catch {
      throw new InternalServerErrorException('שליחת הקוד נכשלה, נסו שוב');
    }
  }

  /** Checks the coach-entered code with Twilio Verify. */
  async verifyOtp(phone: string, code: string): Promise<boolean> {
    const credentials = await this.credentials();
    if (!credentials.verifyServiceSid) {
      throw new SmsSendError('Twilio Verify service is not configured');
    }

    const response = await this.verifyRequest(
      credentials,
      `https://verify.twilio.com/v2/Services/${credentials.verifyServiceSid}/VerificationCheck`,
      { To: phone, Code: code },
      true,
    );
    return response?.status === 'approved';
  }

  private async verifyRequest(
    credentials: TwilioCredentials,
    url: string,
    values: Record<string, string>,
    invalidCodeIsFalse = false,
  ): Promise<{ status?: string } | null> {
    const auth = Buffer.from(
      `${credentials.apiKey}:${credentials.apiSecret}`,
    ).toString('base64');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(values),
      });
    } catch {
      this.logger.error('Twilio Verify request failed');
      throw new SmsSendError('Twilio Verify request failed');
    }

    if (!response.ok) {
      if (invalidCodeIsFalse && (response.status === 400 || response.status === 404)) {
        return null;
      }
      this.logger.error(`Twilio Verify responded ${response.status}`);
      throw new SmsSendError(`Twilio Verify responded ${response.status}`);
    }

    return (await response.json().catch(() => null)) as {
      status?: string;
    } | null;
  }

  private async sendMessage(
    credentials: TwilioCredentials,
    to: string,
    from: string,
    message: string,
  ): Promise<void> {
    const { accountSid, apiKey, apiSecret } = credentials;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const body = new URLSearchParams({ To: to, From: from, Body: message });

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
      this.logger.error(`Twilio request failed for ${to}`);
      throw new SmsSendError('Twilio request failed');
    }

    if (!response.ok) {
      this.logger.error(`Twilio responded ${response.status} sending to ${to}`);
      throw new SmsSendError(`Twilio responded ${response.status}`);
    }
  }
}

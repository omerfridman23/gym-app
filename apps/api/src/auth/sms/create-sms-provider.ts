import type { ConfigService } from '@nestjs/config';
import type { SettingsService } from '../../settings/settings.service.js';
import { DevSmsProvider } from './dev-sms.provider.js';
import { SMS019_ENV_KEYS, Sms019Provider } from './sms019.provider.js';
import type { SmsProvider } from './sms-provider.js';
import { TwilioSmsProvider } from './twilio-sms.provider.js';

export function createSmsProvider(config: ConfigService, settings: SettingsService): SmsProvider {
  const production = config.get('NODE_ENV') === 'production';
  const driver = (config.get<string>('SMS_DRIVER') ?? (production ? 'twilio' : 'dev')).toLowerCase();

  if (driver === '019') {
    for (const key of SMS019_ENV_KEYS) {
      if (!config.get<string>(key)) {
        throw new Error(`SMS_DRIVER=019 requires ${key}`);
      }
    }
    return new Sms019Provider(config);
  }

  if (driver === 'twilio') {
    return new TwilioSmsProvider(config, settings);
  }

  if (driver === 'dev') {
    return new DevSmsProvider();
  }

  throw new Error(`Unknown SMS_DRIVER "${driver}". Use "019", "twilio", or "dev".`);
}

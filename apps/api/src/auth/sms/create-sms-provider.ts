import type { ConfigService } from '@nestjs/config';
import { DevSmsProvider } from './dev-sms.provider.js';
import { SMS019_ENV_KEYS, Sms019Provider } from './sms019.provider.js';
import type { SmsProvider } from './sms-provider.js';
import { TWILIO_ENV_KEYS, TwilioSmsProvider } from './twilio-sms.provider.js';

export function createSmsProvider(config: ConfigService): SmsProvider {
  const production = config.get('NODE_ENV') === 'production';
  const driver = (config.get<string>('SMS_DRIVER') ?? (production ? '019' : 'dev')).toLowerCase();

  function require(keys: readonly string[]): void {
    for (const key of keys) {
      if (!config.get<string>(key)) {
        throw new Error(`SMS_DRIVER=${driver} requires ${key}`);
      }
    }
  }

  if (driver === '019') {
    require(SMS019_ENV_KEYS);
    return new Sms019Provider(config);
  }

  if (driver === 'twilio') {
    require(TWILIO_ENV_KEYS);
    return new TwilioSmsProvider(config);
  }

  if (driver === 'dev') {
    return new DevSmsProvider();
  }

  throw new Error(`Unknown SMS_DRIVER "${driver}". Use "019", "twilio", or "dev".`);
}

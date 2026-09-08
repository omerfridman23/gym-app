import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { SettingsService } from '../../settings/settings.service.js';
import { createSmsProvider } from './create-sms-provider.js';
import { DevSmsProvider } from './dev-sms.provider.js';
import { Sms019Provider } from './sms019.provider.js';
import { TwilioSmsProvider } from './twilio-sms.provider.js';

function configOf(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

const settings = {} as SettingsService;

const sms019Env = {
  SMS_019_USERNAME: 'coachapp',
  SMS_019_TOKEN: 'secret-019-token',
  SMS_019_SOURCE: 'CoachApp',
};

describe('createSmsProvider', () => {
  it('defaults to the console provider outside production', () => {
    expect(
      createSmsProvider(configOf({ NODE_ENV: 'development' }), settings),
    ).toBeInstanceOf(DevSmsProvider);
  });

  it('defaults to Twilio in production (credentials live in settings)', () => {
    expect(
      createSmsProvider(configOf({ NODE_ENV: 'production' }), settings),
    ).toBeInstanceOf(TwilioSmsProvider);
  });

  it('honors an explicit SMS_DRIVER=dev even in production', () => {
    expect(
      createSmsProvider(
        configOf({ NODE_ENV: 'production', SMS_DRIVER: 'dev' }),
        settings,
      ),
    ).toBeInstanceOf(DevSmsProvider);
  });

  it('honors an explicit SMS_DRIVER=019 when env is present', () => {
    expect(
      createSmsProvider(
        configOf({ NODE_ENV: 'development', SMS_DRIVER: '019', ...sms019Env }),
        settings,
      ),
    ).toBeInstanceOf(Sms019Provider);
  });

  it('fails fast when 019 is selected without credentials', () => {
    expect(() =>
      createSmsProvider(configOf({ SMS_DRIVER: '019' }), settings),
    ).toThrow(/SMS_019_USERNAME/);
  });

  it('rejects an unknown driver', () => {
    expect(() =>
      createSmsProvider(configOf({ SMS_DRIVER: 'foo' }), settings),
    ).toThrow(/Unknown SMS_DRIVER/);
  });
});

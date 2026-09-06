import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { createSmsProvider } from './create-sms-provider.js';
import { DevSmsProvider } from './dev-sms.provider.js';
import { Sms019Provider } from './sms019.provider.js';
import { TwilioSmsProvider } from './twilio-sms.provider.js';

function configOf(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

const twilioEnv = {
  TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  TWILIO_AUTH_TOKEN: 'secret-token',
  TWILIO_FROM_NUMBER: '+15017122661',
};

const sms019Env = {
  SMS_019_USERNAME: 'coachapp',
  SMS_019_TOKEN: 'secret-019-token',
  SMS_019_SOURCE: 'CoachApp',
};

describe('createSmsProvider', () => {
  it('defaults to the console provider outside production', () => {
    expect(createSmsProvider(configOf({ NODE_ENV: 'development' }))).toBeInstanceOf(DevSmsProvider);
  });

  it('defaults to 019 in production when credentials are present', () => {
    expect(createSmsProvider(configOf({ NODE_ENV: 'production', ...sms019Env }))).toBeInstanceOf(
      Sms019Provider,
    );
  });

  it('fails fast in production when 019 credentials are missing', () => {
    expect(() => createSmsProvider(configOf({ NODE_ENV: 'production' }))).toThrow(
      /SMS_019_USERNAME/,
    );
  });

  it('honors an explicit SMS_DRIVER=dev even in production', () => {
    expect(
      createSmsProvider(configOf({ NODE_ENV: 'production', SMS_DRIVER: 'dev' })),
    ).toBeInstanceOf(DevSmsProvider);
  });

  it('honors an explicit SMS_DRIVER=019 outside production', () => {
    expect(
      createSmsProvider(configOf({ NODE_ENV: 'development', SMS_DRIVER: '019', ...sms019Env })),
    ).toBeInstanceOf(Sms019Provider);
  });

  it('supports SMS_DRIVER=twilio when credentials are present', () => {
    expect(
      createSmsProvider(configOf({ NODE_ENV: 'development', SMS_DRIVER: 'twilio', ...twilioEnv })),
    ).toBeInstanceOf(TwilioSmsProvider);
  });

  it('fails fast when a selected driver is missing credentials', () => {
    expect(() => createSmsProvider(configOf({ SMS_DRIVER: 'twilio' }))).toThrow(
      /TWILIO_ACCOUNT_SID/,
    );
  });

  it('rejects an unknown driver', () => {
    expect(() => createSmsProvider(configOf({ SMS_DRIVER: 'foo' }))).toThrow(/Unknown SMS_DRIVER/);
  });
});

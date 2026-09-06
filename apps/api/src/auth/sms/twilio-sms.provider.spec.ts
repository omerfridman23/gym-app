import { InternalServerErrorException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsService } from '../../settings/settings.service.js';
import { TwilioSmsProvider } from './twilio-sms.provider.js';

const ACCOUNT = 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const API_KEY = 'SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const SECRET = 'api-key-secret';
const FROM = '+15017122661';

function config(values: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

function settings(values: Record<string, string>): SettingsService {
  return {
    getMany: vi.fn().mockResolvedValue(values),
  } as unknown as SettingsService;
}

describe('TwilioSmsProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('authenticates with the API key from settings, not the account SID', async () => {
    const provider = new TwilioSmsProvider(
      config(),
      settings({
        'twilio.account_sid': ACCOUNT,
        'twilio.api_key': API_KEY,
        'twilio.api_secret': SECRET,
        'twilio.from_number': FROM,
      }),
    );

    await provider.sendOtp('+972501234567', '123456');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT}/Messages.json`);
    expect(init.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from(`${API_KEY}:${SECRET}`).toString('base64')}`,
    });
    const body = new URLSearchParams(init.body as string);
    expect(body.get('From')).toBe(FROM);
    expect(body.get('Body')).toBe('קוד האימות שלך: 123456');
  });

  it('falls back to env when settings are empty', async () => {
    const provider = new TwilioSmsProvider(
      config({
        TWILIO_ACCOUNT_SID: ACCOUNT,
        TWILIO_API_KEY: API_KEY,
        TWILIO_API_SECRET: SECRET,
        TWILIO_FROM_NUMBER: FROM,
      }),
      settings({}),
    );

    await provider.sendOtp('+972501234567', '123456');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the from number is missing', async () => {
    const provider = new TwilioSmsProvider(
      config(),
      settings({
        'twilio.account_sid': ACCOUNT,
        'twilio.api_key': API_KEY,
        'twilio.api_secret': SECRET,
      }),
    );

    await expect(provider.sendOtp('+972501234567', '123456')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws a generic Hebrew error when Twilio returns a non-OK status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const provider = new TwilioSmsProvider(
      config(),
      settings({
        'twilio.account_sid': ACCOUNT,
        'twilio.api_key': API_KEY,
        'twilio.api_secret': SECRET,
        'twilio.from_number': FROM,
      }),
    );

    const error = await provider.sendOtp('+972501234567', '123456').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as Error).message).not.toContain(SECRET);
  });
});

import { InternalServerErrorException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsService } from '../../settings/settings.service.js';
import { TwilioSmsProvider } from './twilio-sms.provider.js';

const ACCOUNT = 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const API_KEY = 'SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const SECRET = 'api-key-secret';
const FROM = '+15017122661';
const VERIFY_SERVICE = 'VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

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
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ status: 'pending' }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests an SMS code through Twilio Verify without a rented number', async () => {
    const provider = new TwilioSmsProvider(
      config(),
      settings({
        'twilio.account_sid': ACCOUNT,
        'twilio.api_key': API_KEY,
        'twilio.api_secret': SECRET,
        'twilio.verify_service_sid': VERIFY_SERVICE,
      }),
    );

    await provider.sendOtp('+972501234567', '123456');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://verify.twilio.com/v2/Services/${VERIFY_SERVICE}/Verifications`,
    );
    expect(init.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from(`${API_KEY}:${SECRET}`).toString('base64')}`,
    });
    const body = new URLSearchParams(init.body as string);
    expect(body.get('To')).toBe('+972501234567');
    expect(body.get('Channel')).toBe('sms');
    expect(body.has('From')).toBe(false);
  });

  it('uses the WhatsApp sender from settings when present', async () => {
    const provider = new TwilioSmsProvider(
      config(),
      settings({
        'twilio.account_sid': ACCOUNT,
        'twilio.api_key': API_KEY,
        'twilio.api_secret': SECRET,
        'twilio.whatsapp_from': 'whatsapp:+14155238886',
      }),
    );

    await provider.sendText('+972545551201', 'היי רון, כאן דנה');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as string);
    expect(body.get('To')).toBe('whatsapp:+972545551201');
    expect(body.get('From')).toBe('whatsapp:+14155238886');
    expect(body.get('Body')).toBe('היי רון, כאן דנה');
  });

  it('falls back to env when settings are empty', async () => {
    const provider = new TwilioSmsProvider(
      config({
        TWILIO_ACCOUNT_SID: ACCOUNT,
        TWILIO_API_KEY: API_KEY,
        TWILIO_API_SECRET: SECRET,
        TWILIO_VERIFY_SERVICE_SID: VERIFY_SERVICE,
      }),
      settings({}),
    );

    await provider.sendOtp('+972501234567', '123456');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the Verify service SID is missing', async () => {
    const provider = new TwilioSmsProvider(
      config(),
      settings({
        'twilio.account_sid': ACCOUNT,
        'twilio.api_key': API_KEY,
        'twilio.api_secret': SECRET,
      }),
    );

    await expect(
      provider.sendOtp('+972501234567', '123456'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a separate WhatsApp sender for reminders', async () => {
    const provider = new TwilioSmsProvider(
      config(),
      settings({
        'twilio.account_sid': ACCOUNT,
        'twilio.api_key': API_KEY,
        'twilio.api_secret': SECRET,
        'twilio.verify_service_sid': VERIFY_SERVICE,
      }),
    );

    await expect(
      provider.sendText('+972501234567', 'reminder'),
    ).rejects.toThrow(/WhatsApp sender/);
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
        'twilio.verify_service_sid': VERIFY_SERVICE,
      }),
    );

    const error = await provider
      .sendOtp('+972501234567', '123456')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as Error).message).not.toContain(SECRET);
  });

  it('approves a code accepted by Twilio Verify', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'approved' }),
    });
    const provider = new TwilioSmsProvider(
      config(),
      settings({
        'twilio.account_sid': ACCOUNT,
        'twilio.api_key': API_KEY,
        'twilio.api_secret': SECRET,
        'twilio.verify_service_sid': VERIFY_SERVICE,
      }),
    );

    await expect(provider.verifyOtp('+972501234567', '123456')).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/Services/${VERIFY_SERVICE}/VerificationCheck`);
    const body = new URLSearchParams(init.body as string);
    expect(body.get('To')).toBe('+972501234567');
    expect(body.get('Code')).toBe('123456');
  });

  it('rejects an incorrect or expired Verify code', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });
    const provider = new TwilioSmsProvider(
      config(),
      settings({
        'twilio.account_sid': ACCOUNT,
        'twilio.api_key': API_KEY,
        'twilio.api_secret': SECRET,
        'twilio.verify_service_sid': VERIFY_SERVICE,
      }),
    );

    await expect(provider.verifyOtp('+972501234567', '000000')).resolves.toBe(false);
  });
});

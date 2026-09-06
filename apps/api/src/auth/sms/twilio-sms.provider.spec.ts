import { InternalServerErrorException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwilioSmsProvider } from './twilio-sms.provider.js';

const SID = 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const TOKEN = 'secret-token';
const FROM = '+15017122661';

function config(): ConfigService {
  const values: Record<string, string> = {
    TWILIO_ACCOUNT_SID: SID,
    TWILIO_AUTH_TOKEN: TOKEN,
    TWILIO_FROM_NUMBER: FROM,
  };
  return {
    getOrThrow: (key: string) => {
      const value = values[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
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

  it('posts the OTP to Twilio Messages without putting the code in the URL', async () => {
    const provider = new TwilioSmsProvider(config());

    await provider.sendOtp('+972501234567', '123456');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect(url).not.toContain('123456');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    const body = new URLSearchParams(init.body as string);
    expect(body.get('To')).toBe('+972501234567');
    expect(body.get('From')).toBe(FROM);
    expect(body.get('Body')).toBe('קוד האימות שלך: 123456');
  });

  it('throws a generic Hebrew error when Twilio returns a non-OK status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const provider = new TwilioSmsProvider(config());

    const error = await provider.sendOtp('+972501234567', '123456').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as Error).message).toBe('שליחת הקוד נכשלה, נסו שוב');
    expect((error as Error).message).not.toContain('123456');
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it('throws the same generic error when the request fails to reach Twilio', async () => {
    fetchMock.mockRejectedValue(new Error('ENOTFOUND api.twilio.com'));
    const provider = new TwilioSmsProvider(config());

    await expect(provider.sendOtp('+972501234567', '654321')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});

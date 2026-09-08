import { InternalServerErrorException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmsSendError } from './sms-provider.js';
import { Sms019Provider } from './sms019.provider.js';

const USERNAME = 'coachapp';
const TOKEN = 'secret-019-token';
const SOURCE = 'CoachApp';

function config(): ConfigService {
  const values: Record<string, string> = {
    SMS_019_USERNAME: USERNAME,
    SMS_019_TOKEN: TOKEN,
    SMS_019_SOURCE: SOURCE,
  };
  return {
    getOrThrow: (key: string) => {
      const value = values[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

describe('Sms019Provider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 0, message: 'SMS will be sent' }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the OTP to the 019 JSON API with a Bearer token', async () => {
    const provider = new Sms019Provider(config());

    await provider.sendOtp('+972501234567', '123456');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://019sms.co.il/api');
    expect(url).not.toContain('123456');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    });
  });

  it('converts the E.164 phone to a local 05X number and includes the code', async () => {
    const provider = new Sms019Provider(config());

    await provider.sendOtp('+972501234567', '123456');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(init.body as string);
    expect(payload.sms.user.username).toBe(USERNAME);
    expect(payload.sms.source).toBe(SOURCE);
    expect(payload.sms.destinations.phone[0]._).toBe('0501234567');
    expect(payload.sms.message).toBe('קוד האימות שלך: 123456');
  });

  it('throws when 019 returns a non-zero logical status despite HTTP 200', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 991, message: 'invalid token' }),
    });
    const provider = new Sms019Provider(config());

    const error = await provider
      .sendOtp('+972501234567', '123456')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as Error).message).toBe('שליחת הקוד נכשלה, נסו שוב');
    expect((error as Error).message).not.toContain('123456');
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it('throws on a non-OK HTTP status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    const provider = new Sms019Provider(config());

    await expect(
      provider.sendOtp('+972501234567', '123456'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('throws the same generic error when the request fails to reach 019', async () => {
    fetchMock.mockRejectedValue(new Error('ENOTFOUND 019sms.co.il'));
    const provider = new Sms019Provider(config());

    await expect(
      provider.sendOtp('+972501234567', '654321'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  describe('sendText (reminders)', () => {
    it('sends an arbitrary message body verbatim', async () => {
      const provider = new Sms019Provider(config());

      await provider.sendText(
        '+972545551201',
        'היי רון, מזכיר את האימון ב-18:00',
      );

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const payload = JSON.parse(init.body as string);
      expect(payload.sms.message).toBe('היי רון, מזכיר את האימון ב-18:00');
      expect(payload.sms.destinations.phone[0]._).toBe('0545551201');
    });

    it('reports failure as SmsSendError, not as an HTTP exception', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 991 }),
      });
      const provider = new Sms019Provider(config());

      const error = await provider
        .sendText('+972545551201', 'שלום')
        .catch((e: unknown) => e);

      // Reminders run in a worker: a 500-shaped exception would be misleading,
      // and the reason must stay loggable without leaking the token.
      expect(error).toBeInstanceOf(SmsSendError);
      expect(error).not.toBeInstanceOf(InternalServerErrorException);
      expect((error as Error).message).toContain('991');
      expect((error as Error).message).not.toContain(TOKEN);
    });
  });
});

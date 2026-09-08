import { InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OTP_MESSAGE_PREFIX, TextSmsProvider } from './sms-provider.js';

class RecordingProvider extends TextSmsProvider {
  readonly sendText =
    vi.fn<(_phone: string, _message: string) => Promise<void>>();
}

describe('TextSmsProvider.sendOtp', () => {
  it('delegates to sendText using the fixed Hebrew OTP prefix', async () => {
    const provider = new RecordingProvider();
    provider.sendText.mockResolvedValue(undefined);

    await expect(
      provider.sendOtp('+972501234567', '012345'),
    ).resolves.toBeUndefined();
    expect(provider.sendText).toHaveBeenCalledWith(
      '+972501234567',
      `${OTP_MESSAGE_PREFIX}012345`,
    );
  });

  it('preserves leading zeroes in the code', async () => {
    const provider = new RecordingProvider();
    provider.sendText.mockResolvedValue(undefined);
    await provider.sendOtp('+972501234567', '000001');
    expect(provider.sendText.mock.calls[0][1]).toContain('000001');
  });

  it.each([
    new Error('gateway leaked api_secret=abc'),
    'hostile string rejection',
    { response: { credentials: 'secret' } },
    null,
  ])(
    'wraps delivery failure %j in the same generic exception',
    async (cause) => {
      const provider = new RecordingProvider();
      provider.sendText.mockRejectedValue(cause);

      const error = await provider
        .sendOtp('+972501234567', '123456')
        .catch((value) => value);

      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect((error as Error).message).toBe('שליחת הקוד נכשלה, נסו שוב');
      expect(JSON.stringify(error)).not.toContain('123456');
      expect(JSON.stringify(error)).not.toContain('secret');
    },
  );
});

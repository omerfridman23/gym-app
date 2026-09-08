import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { AUTH_COOKIE } from './auth.constants.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

function makeController(nodeEnv?: string) {
  const coach = {
    id: 'coach-1',
    phone: '+972501234567',
    name: 'דני',
    vertical: 'fitness' as const,
    onboarded: true,
  };
  const requestOtp = vi.fn().mockResolvedValue(undefined);
  const verifyOtp = vi.fn().mockResolvedValue({ token: 'signed.jwt', coach });
  const toSession = vi.fn().mockReturnValue(coach);
  const findFirst = vi
    .fn()
    .mockResolvedValue({ ...coach, onboardedAt: new Date() });
  const tx = { coach: { findFirst } };
  const withCoach = vi.fn((_id: string, fn: (value: typeof tx) => unknown) =>
    fn(tx),
  );
  const config = { get: vi.fn().mockReturnValue(nodeEnv) };
  const response = { cookie: vi.fn(), clearCookie: vi.fn() };

  return {
    coach,
    requestOtp,
    verifyOtp,
    toSession,
    findFirst,
    withCoach,
    response,
    controller: new AuthController(
      { requestOtp, verifyOtp, toSession } as unknown as AuthService,
      { withCoach } as unknown as PrismaService,
      config as unknown as ConfigService,
    ),
  };
}

describe('AuthController', () => {
  it('forwards an OTP request and returns no body', async () => {
    const h = makeController();
    await expect(
      h.controller.requestOtp({ phone: '0501234567' }),
    ).resolves.toBeUndefined();
    expect(h.requestOtp).toHaveBeenCalledWith('0501234567');
  });

  it.each([undefined, null])(
    'normalizes a %j OTP request body to an empty phone',
    async (body) => {
      const h = makeController();
      await h.controller.requestOtp(body as never);
      expect(h.requestOtp).toHaveBeenCalledWith('');
    },
  );

  it('sets a secure cross-site cookie in production', async () => {
    const h = makeController('production');
    await expect(
      h.controller.verifyOtp(
        { phone: '0501234567', code: '123456' },
        h.response as never,
      ),
    ).resolves.toEqual({ coach: h.coach });

    expect(h.response.cookie).toHaveBeenCalledWith(AUTH_COOKIE, 'signed.jwt', {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  });

  it('sets a same-site non-secure cookie locally', async () => {
    const h = makeController('development');
    await h.controller.verifyOtp(
      { phone: '0501234567', code: '123456' },
      h.response as never,
    );
    expect(h.response.cookie.mock.calls[0][2]).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });
  });

  it('normalizes a missing verify body to empty credentials', async () => {
    const h = makeController();
    await h.controller.verifyOtp(undefined as never, h.response as never);
    expect(h.verifyOtp).toHaveBeenCalledWith('', '');
  });

  it('does not set a cookie if verification fails', async () => {
    const h = makeController();
    h.verifyOtp.mockRejectedValue(new Error('invalid'));
    await expect(
      h.controller.verifyOtp(
        { phone: '0501234567', code: 'bad' },
        h.response as never,
      ),
    ).rejects.toThrow('invalid');
    expect(h.response.cookie).not.toHaveBeenCalled();
  });

  it('scopes /me by the authenticated coach and excludes soft-deleted rows', async () => {
    const h = makeController();
    await expect(h.controller.me('coach-1')).resolves.toEqual({
      coach: h.coach,
    });
    expect(h.withCoach).toHaveBeenCalledWith('coach-1', expect.any(Function));
    expect(h.findFirst).toHaveBeenCalledWith({
      where: { id: 'coach-1', deletedAt: null },
    });
  });

  it('returns null when the authenticated coach is missing or deleted', async () => {
    const h = makeController();
    h.findFirst.mockResolvedValue(null);
    await expect(h.controller.me('coach-1')).resolves.toEqual({ coach: null });
    expect(h.toSession).not.toHaveBeenCalled();
  });

  it('clears the cookie with the same production security attributes', () => {
    const h = makeController('production');
    expect(h.controller.logout(h.response as never)).toBeUndefined();
    expect(h.response.clearCookie).toHaveBeenCalledWith(AUTH_COOKIE, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: undefined,
      path: '/',
    });
  });
});

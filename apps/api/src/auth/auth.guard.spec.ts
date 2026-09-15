import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_COOKIE } from './auth.constants.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthService } from './auth.service.js';

function contextWith(
  cookies?: Record<string, string>,
  headers: Record<string, string> = {},
): ExecutionContext {
  const request: Record<string, unknown> = { cookies, headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const contextWithCookies = (cookies?: Record<string, string>) =>
  contextWith(cookies);

const contextWithAuthHeader = (authorization: string) =>
  contextWith(undefined, { authorization });

function requestOf(context: ExecutionContext): Record<string, unknown> {
  return context.switchToHttp().getRequest();
}

describe('AuthGuard', () => {
  let authService: { verifyToken: ReturnType<typeof vi.fn> };
  let guard: AuthGuard;

  beforeEach(() => {
    authService = { verifyToken: vi.fn().mockResolvedValue('coach-1') };
    guard = new AuthGuard(authService as unknown as AuthService);
  });

  it('rejects a request with no cookies at all', async () => {
    await expect(
      guard.canActivate(contextWithCookies(undefined)),
    ).rejects.toThrow(UnauthorizedException);
    expect(authService.verifyToken).not.toHaveBeenCalled();
  });

  it('rejects a request without the session cookie', async () => {
    await expect(
      guard.canActivate(contextWithCookies({ other: 'x' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an empty session cookie', async () => {
    await expect(
      guard.canActivate(contextWithCookies({ [AUTH_COOKIE]: '' })),
    ).rejects.toThrow(UnauthorizedException);
    expect(authService.verifyToken).not.toHaveBeenCalled();
  });

  it('rejects a token the service refuses', async () => {
    authService.verifyToken.mockRejectedValue(new UnauthorizedException());
    await expect(
      guard.canActivate(contextWithCookies({ [AUTH_COOKIE]: 'bad' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid token and pins the coach id onto the request', async () => {
    const context = contextWithCookies({ [AUTH_COOKIE]: 'good.jwt' });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(authService.verifyToken).toHaveBeenCalledWith('good.jwt');
    expect(requestOf(context).coachId).toBe('coach-1');
  });

  it('takes the coach id only from the verified token, never from client input', async () => {
    const context = contextWithCookies({ [AUTH_COOKIE]: 'good.jwt' });
    requestOf(context).coachId = 'attacker-supplied';

    await guard.canActivate(context);

    expect(requestOf(context).coachId).toBe('coach-1');
  });

  describe('bearer token (native iOS build)', () => {
    it('accepts a bearer token when no cookie is present', async () => {
      const context = contextWithAuthHeader('Bearer good.jwt');

      await expect(guard.canActivate(context)).resolves.toBe(true);

      expect(authService.verifyToken).toHaveBeenCalledWith('good.jwt');
      expect(requestOf(context).coachId).toBe('coach-1');
    });

    it('verifies a bearer token rather than trusting it', async () => {
      authService.verifyToken.mockRejectedValue(new UnauthorizedException());
      await expect(
        guard.canActivate(contextWithAuthHeader('Bearer forged.jwt')),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('prefers the bearer token when a cookie is also present', async () => {
      const context = contextWith({ [AUTH_COOKIE]: 'cookie.jwt' }, {
        authorization: 'Bearer header.jwt',
      });

      await guard.canActivate(context);

      expect(authService.verifyToken).toHaveBeenCalledWith('header.jwt');
    });

    it.each([
      'Bearer',
      'Bearer ',
      'Bearer    ',
      'bearer good.jwt',
      'Basic good.jwt',
      'good.jwt',
    ])('rejects the malformed authorization header %j', async (header) => {
      await expect(
        guard.canActivate(contextWithAuthHeader(header)),
      ).rejects.toThrow(UnauthorizedException);
      expect(authService.verifyToken).not.toHaveBeenCalled();
    });

    it('falls back to the cookie when the header is not a bearer token', async () => {
      const context = contextWith({ [AUTH_COOKIE]: 'cookie.jwt' }, {
        authorization: 'Basic dXNlcjpwYXNz',
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(authService.verifyToken).toHaveBeenCalledWith('cookie.jwt');
    });
  });
});

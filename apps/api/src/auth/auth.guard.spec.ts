import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_COOKIE } from './auth.constants.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthService } from './auth.service.js';

function contextWithCookies(cookies?: Record<string, string>): ExecutionContext {
  const request: Record<string, unknown> = { cookies };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

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
    await expect(guard.canActivate(contextWithCookies(undefined))).rejects.toThrow(UnauthorizedException);
    expect(authService.verifyToken).not.toHaveBeenCalled();
  });

  it('rejects a request without the session cookie', async () => {
    await expect(guard.canActivate(contextWithCookies({ other: 'x' }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an empty session cookie', async () => {
    await expect(guard.canActivate(contextWithCookies({ [AUTH_COOKIE]: '' }))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(authService.verifyToken).not.toHaveBeenCalled();
  });

  it('rejects a token the service refuses', async () => {
    authService.verifyToken.mockRejectedValue(new UnauthorizedException());
    await expect(guard.canActivate(contextWithCookies({ [AUTH_COOKIE]: 'bad' }))).rejects.toThrow(
      UnauthorizedException,
    );
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
});

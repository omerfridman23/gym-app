import { BadRequestException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_COACH_NAME, DEV_COACH_PHONE } from './auth.constants.js';
import type { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import type { SmsProvider } from './sms/sms-provider.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_REQUEST_WINDOW_MS = 15 * 60 * 1000;

function hashOf(phone: string, code: string): string {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

function coachRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'coach-1',
    phone: '+972501234567',
    name: '',
    vertical: null,
    onboardedAt: null,
    ...overrides,
  };
}

type RepoMock = {
  [K in keyof AuthRepository]: ReturnType<typeof vi.fn>;
};

function makeRepo(): RepoMock {
  return {
    countRecentOtpRequests: vi.fn().mockResolvedValue(0),
    createOtp: vi.fn().mockResolvedValue({ id: 'otp-1' }),
    findActiveOtp: vi.fn().mockResolvedValue(null),
    recordFailedAttempt: vi.fn().mockResolvedValue(1),
    consumeOtp: vi.fn().mockResolvedValue(undefined),
    findOrCreateCoach: vi.fn().mockResolvedValue(coachRow()),
    findOrCreateDevCoach: vi.fn().mockResolvedValue(
      coachRow({
        phone: DEV_COACH_PHONE,
        name: DEV_COACH_NAME,
        vertical: 'fitness',
        onboardedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ),
  } as unknown as RepoMock;
}

describe('AuthService', () => {
  let repo: RepoMock;
  let jwt: { signAsync: ReturnType<typeof vi.fn>; verifyAsync: ReturnType<typeof vi.fn> };
  let sms: { sendOtp: ReturnType<typeof vi.fn> };
  let service: AuthService;
  let config: { get: ReturnType<typeof vi.fn> };

  function makeService(nodeEnv = 'test', devLoginEnabled?: string) {
    config = {
      get: vi.fn((key: string) => {
        if (key === 'NODE_ENV') return nodeEnv;
        if (key === 'DEV_LOGIN_ENABLED') return devLoginEnabled;
        return undefined;
      }),
    };
    return new AuthService(
      repo as unknown as AuthRepository,
      jwt as unknown as JwtService,
      sms as unknown as SmsProvider,
      config as unknown as ConfigService,
    );
  }

  beforeEach(() => {
    repo = makeRepo();
    jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token'), verifyAsync: vi.fn() };
    sms = { sendOtp: vi.fn().mockResolvedValue(undefined) };
    service = makeService();
  });

  describe('normalizePhone', () => {
    it.each([
      ['0501234567', '+972501234567'],
      ['0525551201', '+972525551201'],
      ['0545551202', '+972545551202'],
      ['0585551205', '+972585551205'],
      ['050-123-4567', '+972501234567'],
      ['050 123 4567', '+972501234567'],
      ['+972501234567', '+972501234567'],
      ['+972 50-123-4567', '+972501234567'],
    ])('normalizes %s to %s', (input, expected) => {
      expect(service.normalizePhone(input)).toBe(expected);
    });

    it.each([
      ['', 'empty string'],
      ['   ', 'blank'],
      ['123', 'too short'],
      ['0401234567', 'landline prefix 04'],
      ['0301234567', 'landline prefix 03'],
      ['05012345678', '11 digits'],
      ['050123456', '9 digits'],
      ['+9721234567', 'non-mobile international'],
      ['+972501234567890', 'international too long'],
      ['+1 555 123 4567', 'US number'],
      ['05a1234567', 'contains a letter'],
      ['(050)1234567', 'parentheses are not stripped'],
    ])('rejects %s (%s)', (input) => {
      expect(() => service.normalizePhone(input)).toThrow(BadRequestException);
    });

    it('rejects null/undefined without throwing TypeError', () => {
      expect(() => service.normalizePhone(undefined as unknown as string)).toThrow(BadRequestException);
      expect(() => service.normalizePhone(null as unknown as string)).toThrow(BadRequestException);
    });
  });

  describe('requestOtp', () => {
    it('rate-limits by the normalized phone, not the raw input', async () => {
      await service.requestOtp('050-123-4567');

      expect(repo.countRecentOtpRequests).toHaveBeenCalledTimes(1);
      expect(repo.countRecentOtpRequests.mock.calls[0][0]).toBe('+972501234567');
    });

    it('uses a 15 minute rate-limit window', async () => {
      const before = Date.now();
      await service.requestOtp('0501234567');
      const since = repo.countRecentOtpRequests.mock.calls[0][1] as Date;

      expect(since.getTime()).toBeGreaterThanOrEqual(before - OTP_REQUEST_WINDOW_MS - 50);
      expect(since.getTime()).toBeLessThanOrEqual(Date.now() - OTP_REQUEST_WINDOW_MS + 50);
    });

    it('allows the 3rd request in the window', async () => {
      repo.countRecentOtpRequests.mockResolvedValue(2);
      await expect(service.requestOtp('0501234567')).resolves.toBeUndefined();
      expect(repo.createOtp).toHaveBeenCalled();
    });

    it('throws 429 on the 4th request in the window and sends no SMS', async () => {
      repo.countRecentOtpRequests.mockResolvedValue(3);

      const error = await service.requestOtp('0501234567').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(repo.createOtp).not.toHaveBeenCalled();
      expect(sms.sendOtp).not.toHaveBeenCalled();
    });

    it('rejects an invalid phone before consuming rate-limit budget', async () => {
      await expect(service.requestOtp('0401234567')).rejects.toThrow(BadRequestException);
      expect(repo.countRecentOtpRequests).not.toHaveBeenCalled();
      expect(repo.createOtp).not.toHaveBeenCalled();
    });

    it('sends a zero-padded 6 digit code', async () => {
      await service.requestOtp('0501234567');

      const [phone, code] = sms.sendOtp.mock.calls[0] as [string, string];
      expect(phone).toBe('+972501234567');
      expect(code).toMatch(/^\d{6}$/);
    });

    it('persists only the sha256 hash of "phone:code", never the code itself', async () => {
      await service.requestOtp('0501234567');

      const [storedPhone, storedHash] = repo.createOtp.mock.calls[0] as [string, string, Date];
      const [, sentCode] = sms.sendOtp.mock.calls[0] as [string, string];

      expect(storedPhone).toBe('+972501234567');
      expect(storedHash).toBe(hashOf('+972501234567', sentCode));
      expect(storedHash).not.toContain(sentCode);
    });

    it('sets a 10 minute expiry', async () => {
      const before = Date.now();
      await service.requestOtp('0501234567');
      const expiresAt = repo.createOtp.mock.calls[0][2] as Date;

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + OTP_TTL_MS - 50);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + OTP_TTL_MS + 50);
    });

    it('skips SMS for the local 1111 shortcut', async () => {
      await expect(service.requestOtp('1111')).resolves.toBeUndefined();
      expect(repo.countRecentOtpRequests).not.toHaveBeenCalled();
      expect(repo.createOtp).not.toHaveBeenCalled();
      expect(sms.sendOtp).not.toHaveBeenCalled();
    });

    it('still rejects 1111 in production', async () => {
      service = makeService('production');
      await expect(service.requestOtp('1111')).rejects.toThrow(BadRequestException);
      expect(sms.sendOtp).not.toHaveBeenCalled();
    });

    it('allows 1111 in production when explicitly enabled', async () => {
      service = makeService('production', 'true');
      await expect(service.requestOtp('1111')).resolves.toBeUndefined();
      expect(sms.sendOtp).not.toHaveBeenCalled();
    });

    it('does not send an SMS if persisting the code fails', async () => {
      repo.createOtp.mockRejectedValue(new Error('db down'));

      await expect(service.requestOtp('0501234567')).rejects.toThrow('db down');
      expect(sms.sendOtp).not.toHaveBeenCalled();
    });

    it('produces a different code on each request', async () => {
      await service.requestOtp('0501234567');
      await service.requestOtp('0501234567');
      await service.requestOtp('0501234567');

      const codes = sms.sendOtp.mock.calls.map((c) => c[1] as string);
      expect(new Set(codes).size).toBeGreaterThan(1);
    });
  });

  describe('verifyOtp', () => {
    const phone = '0501234567';
    const e164 = '+972501234567';

    function activeOtp(overrides: Record<string, unknown> = {}) {
      return {
        id: 'otp-1',
        phone: e164,
        codeHash: hashOf(e164, '123456'),
        attempts: 0,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        consumedAt: null,
        ...overrides,
      };
    }

    it.each(['', '12345', '1234567', 'abcdef', '12 34 56', '12345a'])(
      'rejects malformed code %j without hitting the database',
      async (code) => {
        await expect(service.verifyOtp(phone, code)).rejects.toThrow(UnauthorizedException);
        expect(repo.findActiveOtp).not.toHaveBeenCalled();
      },
    );

    it('rejects an invalid phone before looking anything up', async () => {
      await expect(service.verifyOtp('0401234567', '123456')).rejects.toThrow(BadRequestException);
      expect(repo.findActiveOtp).not.toHaveBeenCalled();
    });

    it('rejects when there is no active code', async () => {
      repo.findActiveOtp.mockResolvedValue(null);
      await expect(service.verifyOtp(phone, '123456')).rejects.toThrow(UnauthorizedException);
      expect(repo.consumeOtp).not.toHaveBeenCalled();
    });

    it('rejects when the code is already at the attempt ceiling', async () => {
      repo.findActiveOtp.mockResolvedValue(activeOtp({ attempts: 5 }));

      await expect(service.verifyOtp(phone, '123456')).rejects.toThrow(UnauthorizedException);
      expect(repo.recordFailedAttempt).not.toHaveBeenCalled();
      expect(repo.consumeOtp).not.toHaveBeenCalled();
    });

    it('records a failed attempt on a wrong code and does not issue a token', async () => {
      repo.findActiveOtp.mockResolvedValue(activeOtp());
      repo.recordFailedAttempt.mockResolvedValue(1);

      await expect(service.verifyOtp(phone, '000000')).rejects.toThrow(UnauthorizedException);
      expect(repo.recordFailedAttempt).toHaveBeenCalledWith('otp-1');
      expect(repo.consumeOtp).not.toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('burns the code once the 5th wrong attempt lands', async () => {
      repo.findActiveOtp.mockResolvedValue(activeOtp({ attempts: 4 }));
      repo.recordFailedAttempt.mockResolvedValue(5);

      const error = await service.verifyOtp(phone, '000000').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).message).toBe('הקוד פג תוקף, בקשו קוד חדש');
    });

    it('hashes with the normalized phone, so 05x and +972 forms verify identically', async () => {
      repo.findActiveOtp.mockResolvedValue(activeOtp());

      await expect(service.verifyOtp('+972-50-123-4567', '123456')).resolves.toMatchObject({
        token: 'signed.jwt.token',
      });
      expect(repo.findActiveOtp).toHaveBeenCalledWith(e164);
    });

    it('consumes the code, upserts the coach and signs a token on success', async () => {
      repo.findActiveOtp.mockResolvedValue(activeOtp());
      repo.findOrCreateCoach.mockResolvedValue(coachRow({ id: 'coach-42' }));

      const result = await service.verifyOtp(phone, '123456');

      expect(repo.consumeOtp).toHaveBeenCalledWith('otp-1');
      expect(repo.findOrCreateCoach).toHaveBeenCalledWith(e164);
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'coach-42' });
      expect(result.token).toBe('signed.jwt.token');
      expect(result.coach).toEqual({
        id: 'coach-42',
        phone: e164,
        name: '',
        vertical: null,
        onboarded: false,
      });
    });

    it('consumes the code before issuing the token, so it cannot be replayed', async () => {
      repo.findActiveOtp.mockResolvedValue(activeOtp());
      const order: string[] = [];
      repo.consumeOtp.mockImplementation(async () => void order.push('consume'));
      jwt.signAsync.mockImplementation(async () => {
        order.push('sign');
        return 'signed.jwt.token';
      });

      await service.verifyOtp(phone, '123456');

      expect(order).toEqual(['consume', 'sign']);
    });

    it('logs in the local Omer coach for code 1111 without an SMS', async () => {
      const result = await service.verifyOtp('0501234567', '1111');

      expect(repo.findActiveOtp).not.toHaveBeenCalled();
      expect(repo.findOrCreateCoach).not.toHaveBeenCalled();
      expect(repo.findOrCreateDevCoach).toHaveBeenCalledWith(DEV_COACH_PHONE, DEV_COACH_NAME);
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'coach-1' });
      expect(result.coach).toMatchObject({
        phone: DEV_COACH_PHONE,
        name: DEV_COACH_NAME,
        onboarded: true,
      });
    });

    it('logs in the local Omer coach when the phone field is 1111', async () => {
      await expect(service.verifyOtp('1111', '1111')).resolves.toMatchObject({
        token: 'signed.jwt.token',
        coach: { name: DEV_COACH_NAME, onboarded: true },
      });
    });

    it('does not accept the 1111 shortcut in production', async () => {
      service = makeService('production');
      await expect(service.verifyOtp('0501234567', '1111')).rejects.toThrow(UnauthorizedException);
      expect(repo.findOrCreateDevCoach).not.toHaveBeenCalled();
    });

    it('accepts the 1111 shortcut in production when explicitly enabled', async () => {
      service = makeService('production', 'true');
      await expect(service.verifyOtp('1111', '1111')).resolves.toMatchObject({
        token: 'signed.jwt.token',
        coach: { name: DEV_COACH_NAME, onboarded: true },
      });
    });

    it('never leaks the expected code in the error message', async () => {
      repo.findActiveOtp.mockResolvedValue(activeOtp());

      const error = await service.verifyOtp(phone, '999999').catch((e: unknown) => e);

      expect((error as Error).message).not.toContain('123456');
    });
  });

  describe('verifyToken', () => {
    it('returns the subject claim', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'coach-7' });
      await expect(service.verifyToken('t')).resolves.toBe('coach-7');
    });

    it('throws Unauthorized when verification fails', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));
      await expect(service.verifyToken('bad')).rejects.toThrow(UnauthorizedException);
    });

    it('does not surface the underlying jwt error to the caller', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired at 2020-01-01'));
      const error = await service.verifyToken('bad').catch((e: unknown) => e);
      expect((error as Error).message).not.toContain('2020-01-01');
    });
  });

  describe('toSession', () => {
    it('marks a coach with onboardedAt as onboarded', () => {
      const session = service.toSession(
        coachRow({ onboardedAt: new Date(), vertical: 'padel', name: 'דני' }) as never,
      );
      expect(session).toEqual({
        id: 'coach-1',
        phone: '+972501234567',
        name: 'דני',
        vertical: 'padel',
        onboarded: true,
      });
    });

    it('marks a coach without onboardedAt as not onboarded', () => {
      expect(service.toSession(coachRow() as never).onboarded).toBe(false);
    });

    it('does not expose fields beyond the session contract', () => {
      const session = service.toSession(
        coachRow({ templates: { a: 1 }, cancellationPolicy: 'secret' }) as never,
      );
      expect(Object.keys(session).sort()).toEqual(['id', 'name', 'onboarded', 'phone', 'vertical']);
    });
  });
});

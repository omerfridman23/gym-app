import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaAdminService } from '../database/prisma-admin.service.js';
import { AuthRepository } from './auth.repository.js';

describe('AuthRepository', () => {
  let otpCount: ReturnType<typeof vi.fn>;
  let otpUpdateMany: ReturnType<typeof vi.fn>;
  let otpCreate: ReturnType<typeof vi.fn>;
  let otpFindFirst: ReturnType<typeof vi.fn>;
  let otpUpdate: ReturnType<typeof vi.fn>;
  let coachUpsert: ReturnType<typeof vi.fn>;
  let repo: AuthRepository;

  beforeEach(() => {
    otpCount = vi.fn().mockResolvedValue(2);
    otpUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    otpCreate = vi.fn().mockResolvedValue({ id: 'otp-new' });
    otpFindFirst = vi.fn().mockResolvedValue({ id: 'otp-active' });
    otpUpdate = vi.fn().mockResolvedValue({ id: 'otp-1', attempts: 3 });
    coachUpsert = vi.fn().mockResolvedValue({ id: 'coach-1' });
    repo = new AuthRepository({
      otpCode: {
        count: otpCount,
        updateMany: otpUpdateMany,
        create: otpCreate,
        findFirst: otpFindFirst,
        update: otpUpdate,
      },
      coach: { upsert: coachUpsert },
    } as unknown as PrismaAdminService);
  });

  it('counts requests for the exact normalized phone and inclusive window', async () => {
    const since = new Date('2026-09-06T10:00:00.000Z');
    await expect(repo.countRecentOtpRequests('+972501234567', since)).resolves.toBe(2);
    expect(otpCount).toHaveBeenCalledWith({
      where: { phone: '+972501234567', createdAt: { gte: since } },
    });
  });

  it('supersedes outstanding codes before creating a new one', async () => {
    const order: string[] = [];
    otpUpdateMany.mockImplementation(async () => {
      order.push('supersede');
      return { count: 2 };
    });
    otpCreate.mockImplementation(async () => {
      order.push('create');
      return { id: 'otp-new' };
    });
    const expiresAt = new Date('2026-09-06T10:10:00.000Z');

    await repo.createOtp('+972501234567', 'hash', expiresAt);

    expect(order).toEqual(['supersede', 'create']);
    expect(otpUpdateMany).toHaveBeenCalledWith({
      where: { phone: '+972501234567', consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(otpCreate).toHaveBeenCalledWith({
      data: { phone: '+972501234567', codeHash: 'hash', expiresAt },
    });
  });

  it('does not create a code if superseding old codes fails', async () => {
    otpUpdateMany.mockRejectedValue(new Error('db unavailable'));
    await expect(
      repo.createOtp('+972501234567', 'hash', new Date()),
    ).rejects.toThrow('db unavailable');
    expect(otpCreate).not.toHaveBeenCalled();
  });

  it('finds only unconsumed, unexpired codes newest-first', async () => {
    const before = Date.now();
    await repo.findActiveOtp('+972501234567');
    const query = otpFindFirst.mock.calls[0][0];

    expect(query.where.phone).toBe('+972501234567');
    expect(query.where.consumedAt).toBeNull();
    expect(query.where.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(before);
    expect(query.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('increments failed attempts atomically and returns the new count', async () => {
    await expect(repo.recordFailedAttempt('otp-1')).resolves.toBe(3);
    expect(otpUpdate).toHaveBeenCalledWith({
      where: { id: 'otp-1' },
      data: { attempts: { increment: 1 } },
    });
  });

  it('consumes exactly the selected code with a timestamp', async () => {
    await expect(repo.consumeOtp('otp-1')).resolves.toBeUndefined();
    expect(otpUpdate).toHaveBeenCalledWith({
      where: { id: 'otp-1' },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it('upserts by normalized phone without modifying an existing coach', async () => {
    await repo.findOrCreateCoach('+972501234567');
    expect(coachUpsert).toHaveBeenCalledWith({
      where: { phone: '+972501234567' },
      update: {},
      create: { phone: '+972501234567' },
    });
  });

  it('upserts the local shortcut coach with a name and onboarding stamp', async () => {
    await repo.findOrCreateDevCoach('+972501111111', 'עומר');
    expect(coachUpsert).toHaveBeenCalledWith({
      where: { phone: '+972501111111' },
      update: {
        deletedAt: null,
        name: 'עומר',
        vertical: 'fitness',
        onboardedAt: expect.any(Date),
      },
      create: {
        phone: '+972501111111',
        name: 'עומר',
        vertical: 'fitness',
        onboardedAt: expect.any(Date),
      },
    });
  });
});

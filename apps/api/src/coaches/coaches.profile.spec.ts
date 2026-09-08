import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { CoachesService, toProfile } from './coaches.service.js';

function coachRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coach-1',
    phone: '+972501234567',
    name: 'דני',
    vertical: 'fitness',
    defaultPriceAgorot: 18_000,
    reminderHoursBefore: 24,
    cancellationPolicy: 'מדיניות',
    templates: { reminder: 'שלום' },
    onboardedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    bookingSlug: null,
    bookingEnabled: false,
    bookingStartHour: 8,
    bookingEndHour: 21,
    ...overrides,
  };
}

describe('toProfile', () => {
  it('returns exactly the public coach profile contract', () => {
    const profile = toProfile(coachRow({ secret: 'do-not-leak' }) as never);
    expect(Object.keys(profile).sort()).toEqual([
      'bookingEnabled',
      'bookingEndHour',
      'bookingSlug',
      'bookingStartHour',
      'cancellationPolicy',
      'defaultPriceAgorot',
      'id',
      'name',
      'onboarded',
      'phone',
      'reminderHoursBefore',
      'templates',
      'vertical',
    ]);
    expect(JSON.stringify(profile)).not.toContain('secret');
  });

  it('marks onboarded only when onboardedAt is non-null', () => {
    expect(toProfile(coachRow() as never).onboarded).toBe(true);
    expect(toProfile(coachRow({ onboardedAt: null }) as never).onboarded).toBe(
      false,
    );
  });

  it.each([null, 'string', 42, true, ['x']])(
    'normalizes malformed templates %j to an empty object',
    (templates) => {
      expect(toProfile(coachRow({ templates }) as never).templates).toEqual({});
    },
  );

  it('preserves a valid template object', () => {
    const templates = { reminder: 'שלום {שם}', debt: 'חוב {סכום}' };
    expect(toProfile(coachRow({ templates }) as never).templates).toEqual(
      templates,
    );
  });
});

describe('CoachesService.getMe', () => {
  it('uses withCoach and excludes soft-deleted coaches', async () => {
    const findFirst = vi.fn().mockResolvedValue(coachRow());
    const tx = { coach: { findFirst } };
    const withCoach = vi.fn((_id: string, fn: (value: typeof tx) => unknown) =>
      fn(tx),
    );
    const service = new CoachesService({
      withCoach,
    } as unknown as PrismaService);

    await expect(service.getMe('coach-1')).resolves.toMatchObject({
      id: 'coach-1',
    });
    expect(withCoach).toHaveBeenCalledWith('coach-1', expect.any(Function));
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'coach-1', deletedAt: null },
    });
  });

  it('throws 404 when RLS hides another coach', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const tx = { coach: { findFirst } };
    const withCoach = vi.fn((_id: string, fn: (value: typeof tx) => unknown) =>
      fn(tx),
    );
    const service = new CoachesService({
      withCoach,
    } as unknown as PrismaService);

    await expect(service.getMe('other-coach')).rejects.toThrow(
      NotFoundException,
    );
  });
});

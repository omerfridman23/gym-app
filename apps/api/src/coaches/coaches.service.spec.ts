import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { CoachesService } from './coaches.service.js';

const PG_INT4_MAX = 2_147_483_647;

function coachRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coach-1',
    phone: '+972501234567',
    name: '',
    vertical: null,
    defaultPriceAgorot: 0,
    reminderHoursBefore: 24,
    cancellationPolicy: '',
    templates: {},
    bookingSlug: null,
    bookingEnabled: false,
    bookingStartHour: 8,
    bookingEndHour: 21,
    onboardedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('CoachesService.updateMe', () => {
  let findFirst: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let withCoach: ReturnType<typeof vi.fn>;
  let service: CoachesService;

  beforeEach(() => {
    findFirst = vi.fn().mockResolvedValue(coachRow());
    update = vi.fn().mockImplementation(async ({ data }) => coachRow(data));
    const tx = { coach: { findFirst, update } };
    withCoach = vi
      .fn()
      .mockImplementation((_coachId: string, fn: (t: typeof tx) => unknown) =>
        fn(tx),
      );
    service = new CoachesService({ withCoach } as unknown as PrismaService);
  });

  function dataSentToUpdate(): Record<string, unknown> {
    return update.mock.calls[0][0].data as Record<string, unknown>;
  }

  describe('scoping and existence', () => {
    it('runs inside an RLS-scoped transaction for the calling coach', async () => {
      await service.updateMe('coach-1', { name: 'דני' });
      expect(withCoach).toHaveBeenCalledWith('coach-1', expect.any(Function));
    });

    it('only ever updates the calling coach id', async () => {
      await service.updateMe('coach-1', { name: 'דני' });
      expect(update.mock.calls[0][0].where).toEqual({ id: 'coach-1' });
    });

    it('throws 404 when the coach does not exist', async () => {
      findFirst.mockResolvedValue(null);
      await expect(service.updateMe('missing', { name: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('throws 404 for a soft-deleted coach', async () => {
      findFirst.mockResolvedValue(null);
      await expect(service.updateMe('coach-1', { name: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      expect(findFirst.mock.calls[0][0].where).toMatchObject({
        deletedAt: null,
      });
    });
  });

  describe('partial updates', () => {
    it('sends only the supplied fields', async () => {
      await service.updateMe('coach-1', { name: 'דני' });
      expect(Object.keys(dataSentToUpdate())).toEqual(['name']);
    });

    it('sends nothing for an empty patch', async () => {
      await service.updateMe('coach-1', {});
      expect(dataSentToUpdate()).toEqual({});
    });

    it('allows clearing the cancellation policy with an empty string', async () => {
      await service.updateMe('coach-1', { cancellationPolicy: '' });
      expect(dataSentToUpdate()).toEqual({ cancellationPolicy: '' });
    });

    it('allows setting the price to zero', async () => {
      await service.updateMe('coach-1', { defaultPriceAgorot: 0 });
      expect(dataSentToUpdate()).toEqual({ defaultPriceAgorot: 0 });
    });
  });

  describe('normalization', () => {
    it('trims the name', async () => {
      await service.updateMe('coach-1', { name: '  דני  ' });
      expect(dataSentToUpdate().name).toBe('דני');
    });

    it('floors a negative price to zero', async () => {
      await service.updateMe('coach-1', { defaultPriceAgorot: -500 });
      expect(dataSentToUpdate().defaultPriceAgorot).toBe(0);
    });

    it('truncates a fractional price to whole agorot', async () => {
      await service.updateMe('coach-1', { defaultPriceAgorot: 18000.9 });
      expect(dataSentToUpdate().defaultPriceAgorot).toBe(18000);
    });

    it('raises a reminder window below 1 hour to 1', async () => {
      await service.updateMe('coach-1', { reminderHoursBefore: 0 });
      expect(dataSentToUpdate().reminderHoursBefore).toBe(1);
    });

    it('raises a negative reminder window to 1', async () => {
      await service.updateMe('coach-1', { reminderHoursBefore: -12 });
      expect(dataSentToUpdate().reminderHoursBefore).toBe(1);
    });
  });

  describe('onboarding completion', () => {
    it('stamps onboardedAt the first time a vertical is chosen', async () => {
      await service.updateMe('coach-1', { vertical: 'padel' });
      expect(dataSentToUpdate().onboardedAt).toBeInstanceOf(Date);
    });

    it('does not re-stamp onboardedAt when the vertical is changed later', async () => {
      const originalDate = new Date('2026-01-01T00:00:00.000Z');
      findFirst.mockResolvedValue(
        coachRow({ vertical: 'padel', onboardedAt: originalDate }),
      );

      await service.updateMe('coach-1', { vertical: 'fitness' });

      expect(dataSentToUpdate()).not.toHaveProperty('onboardedAt');
      expect(dataSentToUpdate().vertical).toBe('fitness');
    });

    it('does not stamp onboardedAt for a profile-only edit', async () => {
      await service.updateMe('coach-1', {
        name: 'דני',
        defaultPriceAgorot: 18000,
      });
      expect(dataSentToUpdate()).not.toHaveProperty('onboardedAt');
    });
  });

  // These inputs reach the service unfiltered: there is no global ValidationPipe
  // and UpdateCoachInput is a bare interface, so nothing enforces the types at
  // runtime. Each case below is reachable from an unauthenticated-shaped body
  // on PATCH /api/coaches/me by any logged-in coach.
  describe('hostile input on an unvalidated body', () => {
    it('does not crash on a non-string name', async () => {
      await expect(
        service.updateMe('coach-1', { name: 12345 as unknown as string }),
      ).resolves.toBeDefined();
    });

    it('does not persist NaN when the price is not a number', async () => {
      await service.updateMe('coach-1', {
        defaultPriceAgorot: 'abc' as unknown as number,
      });
      expect(
        Number.isNaN(dataSentToUpdate().defaultPriceAgorot as number),
      ).toBe(false);
    });

    it('does not persist NaN when the reminder window is not a number', async () => {
      await service.updateMe('coach-1', {
        reminderHoursBefore: {} as unknown as number,
      });
      expect(
        Number.isNaN(dataSentToUpdate().reminderHoursBefore as number),
      ).toBe(false);
    });

    it('clamps a price above the postgres int4 ceiling instead of failing at the driver', async () => {
      await service.updateMe('coach-1', { defaultPriceAgorot: 99_999_999_00 });
      expect(
        dataSentToUpdate().defaultPriceAgorot as number,
      ).toBeLessThanOrEqual(PG_INT4_MAX);
    });

    it('clamps a reminder window above the postgres int4 ceiling', async () => {
      await service.updateMe('coach-1', {
        reminderHoursBefore: Number.MAX_SAFE_INTEGER,
      });
      expect(
        dataSentToUpdate().reminderHoursBefore as number,
      ).toBeLessThanOrEqual(PG_INT4_MAX);
    });

    it('bounds the cancellation policy length', async () => {
      await service.updateMe('coach-1', {
        cancellationPolicy: 'א'.repeat(100_000),
      });
      expect(
        (dataSentToUpdate().cancellationPolicy as string).length,
      ).toBeLessThanOrEqual(2000);
    });

    it('bounds the name length', async () => {
      await service.updateMe('coach-1', { name: 'א'.repeat(10_000) });
      expect((dataSentToUpdate().name as string).length).toBeLessThanOrEqual(
        200,
      );
    });

    it('ignores unknown keys rather than forwarding them to prisma', async () => {
      await service.updateMe('coach-1', {
        name: 'דני',
        phone: '+972500000000',
        onboardedAt: null,
        id: 'other-coach',
      } as never);

      expect(Object.keys(dataSentToUpdate())).toEqual(['name']);
    });

    it.each([
      { bookingEnabled: 'false' },
      { bookingEnabled: 1 },
      { bookingStartHour: '9' },
      { bookingStartHour: 8.5 },
      { bookingEndHour: 25 },
      { bookingSlug: ['valid-looking'] },
    ])('rejects malformed booking settings: %o', async (input) => {
      await expect(
        service.updateMe('coach-1', input as never),
      ).rejects.toThrow(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });
  });
});

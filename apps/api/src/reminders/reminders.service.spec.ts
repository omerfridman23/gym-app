import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_REMINDER_TEMPLATE,
  RemindersService,
  fillTemplate,
  israelTime,
  toWhatsappNumber,
} from './reminders.service.js';

const COACH_ID = '11111111-1111-4111-8111-111111111111';

/** A coach whose reminder window is 24h, with the default template. */
function coachRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COACH_ID,
    phone: '+972501112222',
    name: 'דנה',
    vertical: 'padel',
    defaultPriceAgorot: 18000,
    reminderHoursBefore: 24,
    cancellationPolicy: '',
    templates: {},
    onboardedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    clientId: 'client-1',
    confirmToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    startsAt: new Date('2026-09-07T15:00:00Z'),
    durationMin: 60,
    location: 'מגרש 1',
    status: 'pending',
    reminderSent: false,
    deletedAt: null,
    client: {
      id: 'client-1',
      name: 'רון אביב',
      phone: '0545551201',
      deletedAt: null,
    },
    ...overrides,
  };
}

interface Tx {
  coach: { findFirst: ReturnType<typeof vi.fn> };
  session: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
}

describe('RemindersService', () => {
  let tx: Tx;
  let prisma: { withCoach: ReturnType<typeof vi.fn> };
  let config: { get: ReturnType<typeof vi.fn> };
  let service: RemindersService;

  beforeEach(() => {
    tx = {
      coach: { findFirst: vi.fn().mockResolvedValue(coachRow()) },
      session: {
        findFirst: vi.fn().mockResolvedValue(sessionRow()),
        findMany: vi.fn().mockResolvedValue([sessionRow()]),
        update: vi
          .fn()
          .mockImplementation(({ data }) => ({ ...sessionRow(), ...data })),
      },
    };
    prisma = {
      withCoach: vi.fn((_coachId: string, fn: (t: Tx) => unknown) => fn(tx)),
    };
    config = { get: vi.fn().mockReturnValue('https://app.example.com') };
    service = new RemindersService(prisma as never, config as never);
  });

  describe('helpers', () => {
    it('fills Hebrew placeholders and leaves unknown ones untouched', () => {
      expect(
        fillTemplate('היי {שם}, ב-{שעה} ב{מיקום}', {
          שם: 'רון',
          שעה: '18:00',
          מיקום: 'מגרש 1',
        }),
      ).toBe('היי רון, ב-18:00 במגרש 1');

      expect(fillTemplate('שלום {לאקיים}', {})).toBe('שלום {לאקיים}');
    });

    it('renders the session hour in Israel time, not UTC', () => {
      // 15:00 UTC in September is 18:00 in Israel (UTC+3, DST).
      expect(israelTime(new Date('2026-09-07T15:00:00Z'))).toBe('18:00');
      // 22:00 UTC in January is 00:00 next day in Israel (UTC+2).
      expect(israelTime(new Date('2026-01-07T22:00:00Z'))).toBe('00:00');
    });

    it('converts Israeli local numbers to wa.me international form', () => {
      expect(toWhatsappNumber('0545551201')).toBe('972545551201');
      expect(toWhatsappNumber('054-555-1201')).toBe('972545551201');
      expect(toWhatsappNumber('972545551201')).toBe('972545551201');
      expect(toWhatsappNumber('')).toBe('');
    });
  });

  describe('listDue', () => {
    it('scopes the query to the coach via withCoach (RLS)', async () => {
      await service.listDue(COACH_ID);
      expect(prisma.withCoach).toHaveBeenCalledWith(
        COACH_ID,
        expect.any(Function),
      );
    });

    it('only asks for unreminded, live sessions inside the coach window', async () => {
      const now = new Date('2026-09-07T06:00:00Z');
      await service.listDue(COACH_ID, now);

      const where = tx.session.findMany.mock.calls[0][0].where;
      expect(where.reminderSent).toBe(false);
      // A client who already confirmed or declined must not be nudged again.
      expect(where.reminderAnswered).toBe(false);
      expect(where.deletedAt).toBeNull();
      expect(where.status).toEqual({ in: ['pending', 'confirmed'] });
      expect(where.startsAt.gte).toEqual(now);
      // 24h window from the coach's reminderHoursBefore
      expect(where.startsAt.lte).toEqual(new Date('2026-09-08T06:00:00Z'));
    });

    it('honours a custom reminder window', async () => {
      tx.coach.findFirst.mockResolvedValue(
        coachRow({ reminderHoursBefore: 3 }),
      );
      const now = new Date('2026-09-07T06:00:00Z');
      await service.listDue(COACH_ID, now);

      const where = tx.session.findMany.mock.calls[0][0].where;
      expect(where.startsAt.lte).toEqual(new Date('2026-09-07T09:00:00Z'));
    });

    it('renders the message with the real confirm token link', async () => {
      const [reminder] = await service.listDue(COACH_ID);

      expect(reminder.confirmUrl).toBe(
        'https://app.example.com/confirm/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
      // First name only, Israel-local hour, real link — no coach.link placeholder.
      expect(reminder.message).toContain('רון');
      expect(reminder.message).toContain('דנה');
      expect(reminder.message).not.toContain('אביב');
      expect(reminder.message).toContain('18:00');
      expect(reminder.message).toContain(reminder.confirmUrl);
      expect(reminder.message).not.toContain('coach.link');
      expect(reminder.message).not.toContain('{');
    });

    it('builds a wa.me link with the encoded message', async () => {
      const [reminder] = await service.listDue(COACH_ID);
      expect(
        reminder.whatsappUrl.startsWith('https://wa.me/972545551201?text='),
      ).toBe(true);
      expect(decodeURIComponent(reminder.whatsappUrl.split('?text=')[1])).toBe(
        reminder.message,
      );
    });

    it("uses the coach's own template when they set one", async () => {
      tx.coach.findFirst.mockResolvedValue(
        coachRow({ templates: { reminder: 'אימון ב-{שעה}. לאישור: {קישור}' } }),
      );
      const [reminder] = await service.listDue(COACH_ID);
      expect(reminder.message).toBe(
        'אימון ב-18:00. לאישור: https://app.example.com/confirm/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
    });

    it('falls back to the default template when the coach cleared theirs', async () => {
      tx.coach.findFirst.mockResolvedValue(
        coachRow({ templates: { reminder: '' } }),
      );
      const [reminder] = await service.listDue(COACH_ID);
      expect(reminder.message).toContain('מזכיר לך את האימון');
      expect(DEFAULT_REMINDER_TEMPLATE).toContain('{קישור}');
    });

    it('handles a missing location without printing "null"', async () => {
      tx.session.findMany.mockResolvedValue([sessionRow({ location: null })]);
      const [reminder] = await service.listDue(COACH_ID);
      expect(reminder.location).toBeNull();
      expect(reminder.message).not.toContain('null');
      expect(reminder.message).not.toContain('undefined');
    });

    it('skips sessions whose client was soft-deleted', async () => {
      tx.session.findMany.mockResolvedValue([
        sessionRow({
          client: {
            id: 'c',
            name: 'X',
            phone: '0500000000',
            deletedAt: new Date(),
          },
        }),
      ]);
      expect(await service.listDue(COACH_ID)).toEqual([]);
    });

    it('throws NotFound for a coach that does not exist', async () => {
      tx.coach.findFirst.mockResolvedValue(null);
      await expect(service.listDue(COACH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('never exposes the coach phone or raw client row', async () => {
      const [reminder] = await service.listDue(COACH_ID);
      expect(JSON.stringify(reminder)).not.toContain('+972501112222');
      expect(Object.keys(reminder).sort()).toEqual(
        [
          'clientId',
          'clientName',
          'clientPhone',
          'confirmUrl',
          'durationMin',
          'location',
          'message',
          'sessionId',
          'startsAt',
          'timeLocal',
          'whatsappUrl',
        ].sort(),
      );
    });
  });

  describe('markSent', () => {
    it('flags the session as reminded, scoped to the coach', async () => {
      const updated = await service.markSent(COACH_ID, 'session-1');

      expect(prisma.withCoach).toHaveBeenCalledWith(
        COACH_ID,
        expect.any(Function),
      );
      expect(tx.session.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { reminderSent: true },
      });
      expect(updated.reminderSent).toBe(true);
    });

    it('does not touch the answer flag — only the coach-side send state', async () => {
      await service.markSent(COACH_ID, 'session-1');
      expect(tx.session.update.mock.calls[0][0].data).not.toHaveProperty(
        'reminderAnswered',
      );
      expect(tx.session.update.mock.calls[0][0].data).not.toHaveProperty(
        'status',
      );
    });

    it('throws NotFound for another coach session or a deleted one', async () => {
      tx.session.findFirst.mockResolvedValue(null);
      await expect(service.markSent(COACH_ID, 'other')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.session.update).not.toHaveBeenCalled();
    });
  });
});

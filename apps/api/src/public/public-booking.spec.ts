import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaAdminService } from '../database/prisma-admin.service.js';
import { PublicService } from './public.service.js';

/**
 * Public self-booking (/book/:slug). Fixed clock: 2026-09-08T10:00:00Z is
 * 13:00 in Israel (IDT, UTC+3), so with the 2-hour notice the first offered
 * slot today is 15:00 local.
 */
const NOW = new Date('2026-09-08T10:00:00.000Z');
const SLUG = 'dana';

function coach(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coach-1',
    name: 'דנה המאמנת',
    vertical: 'padel',
    defaultPriceAgorot: 18_000,
    bookingSlug: SLUG,
    bookingEnabled: true,
    bookingStartHour: 8,
    bookingEndHour: 21,
    deletedAt: null as Date | null,
    ...overrides,
  };
}

interface FakeRows {
  coach?: ReturnType<typeof coach> | null;
  busy?: { startsAt: Date; durationMin: number }[];
  clients?: { id: string; phone: string; priceAgorot: number }[];
  upcomingPendingCount?: number;
  recentBookingCount?: number;
}

function makeDb(rows: FakeRows = {}) {
  const theCoach = rows.coach === undefined ? coach() : rows.coach;

  const coachFindFirst = vi.fn(
    async ({
      where,
      include,
    }: {
      where: Record<string, unknown>;
      include?: Record<string, unknown>;
    }) => {
      if (!theCoach) return null;
      if (where.bookingSlug !== theCoach.bookingSlug) return null;
      if (where.bookingEnabled === true && !theCoach.bookingEnabled)
        return null;
      if (where.deletedAt === null && theCoach.deletedAt !== null) return null;
      return include
        ? { ...theCoach, sessions: rows.busy ?? [] }
        : theCoach;
    },
  );
  const sessionFindMany = vi.fn(async () => rows.busy ?? []);
  const sessionCount = vi.fn(
    async ({ where }: { where: Record<string, unknown> }) =>
      'clientId' in where
        ? (rows.upcomingPendingCount ?? 0)
        : (rows.recentBookingCount ?? 0),
  );
  const sessionCreate = vi.fn(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'session-new',
      ...data,
    }),
  );
  const clientFindFirst = vi.fn(
    async ({ where }: { where: { normalizedPhone?: string } }) =>
      (rows.clients ?? []).find((client) => {
        const digits = client.phone.replace(/\D/g, '');
        const normalized = digits.startsWith('0')
          ? `+972${digits.slice(1)}`
          : `+${digits}`;
        return normalized === where.normalizedPhone;
      }) ?? null,
  );
  const clientCreate = vi.fn(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'client-new',
      phone: data.phone,
      priceAgorot: data.priceAgorot,
    }),
  );
  const executeRaw = vi.fn(async () => 1);

  const db: Record<string, unknown> = {
    coach: { findFirst: coachFindFirst },
    session: {
      findMany: sessionFindMany,
      count: sessionCount,
      create: sessionCreate,
    },
    client: { findFirst: clientFindFirst, create: clientCreate },
    $executeRaw: executeRaw,
  };
  db.$transaction = vi.fn(async (fn: (tx: typeof db) => unknown) => fn(db));

  return {
    coachFindFirst,
    sessionFindMany,
    sessionCount,
    sessionCreate,
    clientFindFirst,
    clientCreate,
    executeRaw,
    service: new PublicService(db as unknown as PrismaAdminService),
  };
}

/** A slot instant on the offered grid: Israel wall clock hour on a given day. */
function slot(dayOffset: number, hourLocal: number): Date {
  // September 2026: Israel is UTC+3.
  const base = new Date(NOW);
  base.setUTCDate(base.getUTCDate() + dayOffset);
  base.setUTCHours(hourLocal - 3, 0, 0, 0);
  return base;
}

const BOOK_INPUT = { name: 'יוסי כהן', phone: '050-1234567' };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PublicService.getBookingInfo', () => {
  it.each([
    '',
    'a',
    'עברית',
    'UPPER CASE!',
    '-dash-edges-',
    'a'.repeat(31),
    "' OR 1=1 --",
  ])('throws 404 for the malformed slug %j without querying', async (slug) => {
    const h = makeDb();
    await expect(h.service.getBookingInfo(slug)).rejects.toThrow(
      NotFoundException,
    );
    expect(h.coachFindFirst).not.toHaveBeenCalled();
  });

  it('throws 404 for an unknown slug', async () => {
    const h = makeDb({ coach: null });
    await expect(h.service.getBookingInfo(SLUG)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 404 when the coach turned booking off', async () => {
    const h = makeDb({ coach: coach({ bookingEnabled: false }) });
    await expect(h.service.getBookingInfo(SLUG)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 404 for a soft-deleted coach', async () => {
    const h = makeDb({
      coach: coach({ deletedAt: new Date('2026-09-01T00:00:00.000Z') }),
    });
    await expect(h.service.getBookingInfo(SLUG)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('accepts an upper-cased slug, since links get mangled by some apps', async () => {
    const h = makeDb();
    await expect(h.service.getBookingInfo('DaNa')).resolves.toBeDefined();
  });

  it('offers exactly 14 days', async () => {
    const h = makeDb();
    const info = await h.service.getBookingInfo(SLUG);
    expect(info.days).toHaveLength(14);
  });

  it('offers hourly slots inside the local work window on a free day', async () => {
    const h = makeDb();
    const info = await h.service.getBookingInfo(SLUG);

    // Tomorrow is fully free: 08:00 through 20:00 (last 60-min slot ends 21:00).
    const tomorrow = info.days[1];
    expect(tomorrow.slots[0].timeLocal).toBe('08:00');
    expect(tomorrow.slots.at(-1)?.timeLocal).toBe('20:00');
    expect(tomorrow.slots).toHaveLength(13);
  });

  it('hides slots that start less than two hours from now', async () => {
    const h = makeDb();
    const info = await h.service.getBookingInfo(SLUG);

    // NOW is 13:00 Israel; the first slot today must be 15:00.
    expect(info.days[0].slots[0]?.timeLocal).toBe('15:00');
  });

  it('hides a slot taken by an existing session', async () => {
    const h = makeDb({ busy: [{ startsAt: slot(1, 10), durationMin: 60 }] });
    const info = await h.service.getBookingInfo(SLUG);

    const times = info.days[1].slots.map((s) => s.timeLocal);
    expect(times).not.toContain('10:00');
    expect(times).toContain('09:00');
    expect(times).toContain('11:00');
  });

  it('hides both slots straddled by a long session', async () => {
    // 90 minutes starting 10:30 blocks the 10:00 and 11:00 hourly slots.
    const start = slot(1, 10);
    start.setUTCMinutes(30);
    const h = makeDb({ busy: [{ startsAt: start, durationMin: 90 }] });

    const times = (await h.service.getBookingInfo(SLUG)).days[1].slots.map(
      (s) => s.timeLocal,
    );
    expect(times).not.toContain('10:00');
    expect(times).not.toContain('11:00');
    expect(times).toContain('09:00');
  });

  it('offers 50-minute sessions for a fitness coach', async () => {
    const h = makeDb({ coach: coach({ vertical: 'fitness' }) });
    const info = await h.service.getBookingInfo(SLUG);
    expect(info.durationMin).toBe(50);
  });

  it('exposes only the page contract: name, vertical, duration, price, days', async () => {
    const h = makeDb();
    const info = await h.service.getBookingInfo(SLUG);

    expect(Object.keys(info).sort()).toEqual([
      'coachName',
      'days',
      'durationMin',
      'priceAgorot',
      'vertical',
    ]);
    expect(JSON.stringify(info)).not.toContain('coach-1');
  });
});

describe('PublicService.book', () => {
  const freeSlot = () => slot(1, 10).toISOString();

  it('throws 400 without a name', async () => {
    const h = makeDb();
    await expect(
      h.service.book(SLUG, {
        startsAt: freeSlot(),
        name: '  ',
        phone: '0501234567',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it.each(['', 'abc', '12345', '+15551234567', '03-1234567'])(
    'throws 400 for the undialable phone %j',
    async (phone) => {
      const h = makeDb();
      await expect(
        h.service.book(SLUG, { startsAt: freeSlot(), name: 'יוסי', phone }),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('throws 400 for a slot off the hourly grid', async () => {
    const offGrid = slot(1, 10);
    offGrid.setUTCMinutes(30);
    const h = makeDb();
    await expect(
      h.service.book(SLUG, { startsAt: offGrid.toISOString(), ...BOOK_INPUT }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects hidden seconds even when the local minute is zero', async () => {
    const withSeconds = slot(1, 10);
    withSeconds.setUTCSeconds(30);
    const h = makeDb();
    await expect(
      h.service.book(SLUG, {
        startsAt: withSeconds.toISOString(),
        ...BOOK_INPUT,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(h.sessionCreate).not.toHaveBeenCalled();
  });

  it('throws 400 for a slot outside the work window', async () => {
    const h = makeDb();
    await expect(
      h.service.book(SLUG, {
        startsAt: slot(1, 6).toISOString(),
        ...BOOK_INPUT,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws 400 for a slot starting too soon', async () => {
    // 14:00 Israel today — inside the window but under the 2h notice.
    const h = makeDb();
    await expect(
      h.service.book(SLUG, {
        startsAt: slot(0, 14).toISOString(),
        ...BOOK_INPUT,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws 400 for a slot beyond the 14-day horizon', async () => {
    const h = makeDb();
    await expect(
      h.service.book(SLUG, {
        startsAt: slot(15, 10).toISOString(),
        ...BOOK_INPUT,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws 409 when the slot was grabbed a moment earlier', async () => {
    const h = makeDb({ busy: [{ startsAt: slot(1, 10), durationMin: 60 }] });
    await expect(
      h.service.book(SLUG, { startsAt: freeSlot(), ...BOOK_INPUT }),
    ).rejects.toThrow(ConflictException);
    expect(h.sessionCreate).not.toHaveBeenCalled();
  });

  it('takes a transaction-scoped advisory lock before checking the slot', async () => {
    const h = makeDb();
    await h.service.book(SLUG, { startsAt: freeSlot(), ...BOOK_INPUT });

    expect(h.executeRaw).toHaveBeenCalledTimes(2);
    expect(h.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      h.sessionFindMany.mock.invocationCallOrder[0],
    );
  });

  it('creates a new client card with the coach default price', async () => {
    const h = makeDb();
    await h.service.book(SLUG, { startsAt: freeSlot(), ...BOOK_INPUT });

    expect(h.clientCreate).toHaveBeenCalledWith({
      data: {
        coachId: 'coach-1',
        name: 'יוסי כהן',
        phone: '+972501234567',
        normalizedPhone: '+972501234567',
        priceAgorot: 18_000,
      },
      select: { id: true, phone: true, priceAgorot: true },
    });
  });

  it('reuses an existing client matched by phone in any format', async () => {
    const h = makeDb({
      clients: [{ id: 'client-7', phone: '050-123-4567', priceAgorot: 22_000 }],
    });
    await h.service.book(SLUG, {
      startsAt: freeSlot(),
      name: 'יוסי',
      phone: '+972501234567',
    });

    expect(h.clientCreate).not.toHaveBeenCalled();
    expect(h.sessionCreate.mock.calls[0][0].data).toMatchObject({
      clientId: 'client-7',
      priceAgorot: 22_000, // the client's own price wins over the default
    });
  });

  it('preserves an intentional zero client price', async () => {
    const h = makeDb({
      clients: [{ id: 'client-free', phone: '0501234567', priceAgorot: 0 }],
    });
    await h.service.book(SLUG, {
      startsAt: freeSlot(),
      ...BOOK_INPUT,
    });

    expect(h.sessionCreate.mock.calls[0][0].data.priceAgorot).toBe(0);
  });

  it('creates the session as pending with the offered duration', async () => {
    const h = makeDb();
    const booking = await h.service.book(SLUG, {
      startsAt: freeSlot(),
      ...BOOK_INPUT,
    });

    expect(h.sessionCreate.mock.calls[0][0].data).toMatchObject({
      coachId: 'coach-1',
      typeId: 'private',
      durationMin: 60,
      status: 'pending',
      location: null,
    });
    expect(booking).toMatchObject({
      coachName: 'דנה המאמנת',
      clientFirstName: 'יוסי',
      timeLocal: '10:00',
      durationMin: 60,
    });
  });

  it('blocks a client who already has 4 loose pending sessions', async () => {
    const h = makeDb({
      clients: [{ id: 'client-7', phone: '0501234567', priceAgorot: 18_000 }],
      upcomingPendingCount: 4,
    });

    await expect(
      h.service.book(SLUG, { startsAt: freeSlot(), ...BOOK_INPUT }),
    ).rejects.toThrow(ConflictException);
    expect(h.sessionCreate).not.toHaveBeenCalled();
  });

  it('returns 429 when recent pending bookings hit the coach abuse ceiling', async () => {
    const h = makeDb({ recentBookingCount: 30 });

    await expect(
      h.service.book(SLUG, { startsAt: freeSlot(), ...BOOK_INPUT }),
    ).rejects.toMatchObject({ status: 429 });
    expect(h.clientCreate).not.toHaveBeenCalled();
    expect(h.sessionCreate).not.toHaveBeenCalled();
  });

  it('does not rate-limit a brand-new client', async () => {
    const h = makeDb({ upcomingPendingCount: 99 });
    await expect(
      h.service.book(SLUG, { startsAt: freeSlot(), ...BOOK_INPUT }),
    ).resolves.toBeDefined();
  });

  it('throws 404 when booking is disabled, before touching any data', async () => {
    const h = makeDb({ coach: coach({ bookingEnabled: false }) });
    await expect(
      h.service.book(SLUG, { startsAt: freeSlot(), ...BOOK_INPUT }),
    ).rejects.toThrow(NotFoundException);
    expect(h.sessionCreate).not.toHaveBeenCalled();
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { addDaysToIsoDate, israelWallClockToUtc, SessionsService } from './sessions.service.js';

const PG_INT4_MAX = 2_147_483_647;
const OWNER = 'coach-1';
const OTHER = 'coach-2';
const SERIES_WEEKS = 12;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** "HH:MM" of a UTC instant as a person in Israel would read it off a clock. */
function israelTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** "Sun" — the Israel weekday of a UTC instant. */
function israelWeekday(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
  }).format(date);
}

function clientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'client-1',
    coachId: OWNER,
    name: 'דני לוי',
    phone: '+972501234567',
    deletedAt: null as Date | null,
    ...overrides,
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    coachId: OWNER,
    clientId: 'client-1',
    seriesId: null,
    typeId: 'private',
    startsAt: new Date('2026-09-06T15:00:00.000Z'),
    durationMin: 60,
    location: null,
    priceAgorot: 18_000,
    status: 'pending',
    paid: false,
    packageId: null,
    reminderSent: false,
    reminderAnswered: false,
    attendance: null,
    cancelReason: null,
    deletedAt: null as Date | null,
    ...overrides,
  };
}

type Where = { id?: string; deletedAt?: Date | null };

/**
 * Stand-in for postgres RLS, which a unit test cannot run: the fake `tx` only
 * sees rows whose coachId matches the coach `withCoach` was called with, so a
 * foreign coachId behaves the way the database would.
 */
function makeHarness(
  rows: {
    clients?: ReturnType<typeof clientRow>[];
    sessions?: ReturnType<typeof sessionRow>[];
  } = {},
) {
  const clients = rows.clients ?? [clientRow()];
  const sessions = rows.sessions ?? [sessionRow()];
  let scopedCoachId = '';

  const visible = <T extends { coachId: string; id: string; deletedAt: Date | null }>(
    all: T[],
    where: Where | undefined,
  ) =>
    all.filter(
      (row) =>
        row.coachId === scopedCoachId &&
        (where?.id === undefined || row.id === where.id) &&
        (where?.deletedAt !== null || row.deletedAt === null),
    );

  const clientFindFirst = vi.fn(
    async ({ where }: { where?: Where }) => visible(clients, where)[0] ?? null,
  );
  const sessionFindFirst = vi.fn(
    async ({ where }: { where?: Where }) => visible(sessions, where)[0] ?? null,
  );
  const sessionFindMany = vi.fn(async ({ where }: { where?: Where }) => visible(sessions, where));

  let created = 0;
  const sessionCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    created += 1;
    return sessionRow({ ...data, id: `created-${created}` });
  });
  const sessionUpdate = vi.fn(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      sessionRow({ ...data, id: where.id }),
  );
  const seriesCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'series-1',
    ...data,
  }));

  const tx = {
    client: { findFirst: clientFindFirst },
    session: {
      findFirst: sessionFindFirst,
      findMany: sessionFindMany,
      create: sessionCreate,
      update: sessionUpdate,
    },
    sessionSeries: { create: seriesCreate },
  };
  const withCoach = vi.fn((coachId: string, fn: (t: typeof tx) => unknown) => {
    scopedCoachId = coachId;
    return fn(tx);
  });

  return {
    withCoach,
    clientFindFirst,
    sessionFindFirst,
    sessionFindMany,
    sessionCreate,
    sessionUpdate,
    seriesCreate,
    service: new SessionsService({ withCoach } as unknown as PrismaService),
  };
}

describe('SessionsService.list', () => {
  it('runs inside an RLS-scoped transaction for the calling coach', async () => {
    const h = makeHarness();
    await h.service.list(OWNER);
    expect(h.withCoach).toHaveBeenCalledWith(OWNER, expect.any(Function));
  });

  it('excludes soft-deleted sessions', async () => {
    const h = makeHarness({
      sessions: [
        sessionRow({ id: 'live' }),
        sessionRow({ id: 'gone', deletedAt: new Date('2026-02-01T00:00:00.000Z') }),
      ],
    });

    const result = await h.service.list(OWNER);

    expect(h.sessionFindMany.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
    expect(result.map((s) => s.id)).toEqual(['live']);
  });

  it('never returns another coach sessions', async () => {
    const h = makeHarness({
      sessions: [sessionRow({ id: 'mine' }), sessionRow({ id: 'theirs', coachId: OTHER })],
    });

    await expect(h.service.list(OWNER)).resolves.toMatchObject([{ id: 'mine' }]);
  });

  it('sorts chronologically', async () => {
    const h = makeHarness();
    await h.service.list(OWNER);
    expect(h.sessionFindMany.mock.calls[0][0]).toMatchObject({ orderBy: { startsAt: 'asc' } });
  });

  it('adds no date filter when no range is given', async () => {
    const h = makeHarness();
    await h.service.list(OWNER);
    expect(h.sessionFindMany.mock.calls[0][0].where).toEqual({ deletedAt: null });
  });

  it('filters on a half-open range so week boundaries do not double-count', async () => {
    const h = makeHarness();
    await h.service.list(OWNER, '2026-09-06T00:00:00Z', '2026-09-13T00:00:00Z');

    expect(h.sessionFindMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      startsAt: {
        gte: new Date('2026-09-06T00:00:00Z'),
        lt: new Date('2026-09-13T00:00:00Z'),
      },
    });
  });

  it('accepts an open-ended range', async () => {
    const h = makeHarness();
    await h.service.list(OWNER, '2026-09-06T00:00:00Z');

    expect(h.sessionFindMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      startsAt: { gte: new Date('2026-09-06T00:00:00Z') },
    });
  });

  it.each([
    ['garbage', undefined],
    [undefined, 'garbage'],
    ['2026-13-45', undefined],
    ['not-a-date', 'also-not'],
    ['NaN', undefined],
  ])('rejects the range (%j, %j) before opening a transaction', async (from, to) => {
    const h = makeHarness();
    await expect(h.service.list(OWNER, from, to)).rejects.toThrow(BadRequestException);
    expect(h.withCoach).not.toHaveBeenCalled();
  });

  it('treats an empty string as "no bound" rather than an invalid date', async () => {
    const h = makeHarness();
    await expect(h.service.list(OWNER, '', '')).resolves.toBeDefined();
    expect(h.sessionFindMany.mock.calls[0][0].where).toEqual({ deletedAt: null });
  });
});

describe('SessionsService.create', () => {
  function dataSentToCreate(h: ReturnType<typeof makeHarness>): Record<string, unknown> {
    return h.sessionCreate.mock.calls[0][0].data;
  }

  const valid = { clientId: 'client-1', typeId: 'private', startsAt: '2026-09-06T15:00:00Z' };

  describe('input validation', () => {
    it.each([
      [{ ...valid, startsAt: 'tomorrow' }, 'unparseable date'],
      [{ ...valid, startsAt: '' }, 'empty date'],
      [{ ...valid, startsAt: '2026-99-99T00:00:00Z' }, 'out-of-range date'],
      [{ ...valid, startsAt: undefined }, 'missing date'],
      [{ ...valid, startsAt: Number.NaN }, 'NaN date'],
      [{ ...valid, startsAt: {} }, 'object date'],
      [{ ...valid, startsAt: null }, 'null date'],
      [{ ...valid, clientId: '' }, 'empty client'],
      [{ ...valid, clientId: undefined }, 'missing client'],
      [{}, 'empty body'],
    ])('rejects %j (%s) before opening a transaction', async (input) => {
      const h = makeHarness();
      await expect(h.service.create(OWNER, input as never)).rejects.toThrow(BadRequestException);
      expect(h.withCoach).not.toHaveBeenCalled();
    });

    it('rejects a null body without a TypeError', async () => {
      const h = makeHarness();
      await expect(h.service.create(OWNER, null as never)).rejects.toThrow(BadRequestException);
    });
  });

  describe('scoping', () => {
    it('runs inside an RLS-scoped transaction for the calling coach', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, valid);
      expect(h.withCoach).toHaveBeenCalledWith(OWNER, expect.any(Function));
    });

    it('throws 404 for an unknown client', async () => {
      const h = makeHarness();
      await expect(h.service.create(OWNER, { ...valid, clientId: 'nope' })).rejects.toThrow(
        NotFoundException,
      );
      expect(h.sessionCreate).not.toHaveBeenCalled();
    });

    it('throws 404 for a soft-deleted client', async () => {
      const h = makeHarness({
        clients: [clientRow({ deletedAt: new Date('2026-02-01T00:00:00.000Z') })],
      });

      await expect(h.service.create(OWNER, valid)).rejects.toThrow(NotFoundException);
      expect(h.sessionCreate).not.toHaveBeenCalled();
    });

    it('throws 404 — books nothing — when the client belongs to another coach', async () => {
      const h = makeHarness({ clients: [clientRow({ coachId: OTHER })] });

      await expect(h.service.create(OWNER, valid)).rejects.toThrow(NotFoundException);
      expect(h.sessionCreate).not.toHaveBeenCalled();
      expect(h.seriesCreate).not.toHaveBeenCalled();
    });

    it('stamps the coachId from the session, not from the request body', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, coachId: OTHER } as never);

      expect(dataSentToCreate(h).coachId).toBe(OWNER);
    });

    it('takes the clientId from the row it verified, not from the raw input', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, valid);

      expect(dataSentToCreate(h).clientId).toBe('client-1');
    });
  });

  describe('normalization', () => {
    it('stores the start instant as UTC', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, startsAt: '2026-09-06T15:00:00Z' });

      expect(dataSentToCreate(h).startsAt).toEqual(new Date('2026-09-06T15:00:00.000Z'));
    });

    it('defaults the type to private when it is blank', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, typeId: '   ' });

      expect(dataSentToCreate(h).typeId).toBe('private');
    });

    it('bounds the type id length', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, typeId: 'x'.repeat(500) });

      expect((dataSentToCreate(h).typeId as string).length).toBe(50);
    });

    it.each([
      [undefined, 60, 'missing'],
      [0, 60, 'zero'],
      [Number.NaN, 60, 'NaN'],
      ['abc' as never, 60, 'non-numeric'],
      [-30, 60, 'negative'],
      [1, 15, 'below the 15 minute floor'],
      [14, 15, 'just below the floor'],
      [45, 45, 'in range'],
      [45.9, 45, 'fractional'],
      [1440, 1440, 'exactly a day'],
      [5000, 1440, 'above a day'],
      [Number.MAX_SAFE_INTEGER, 1440, 'absurd'],
    ])('clamps a duration of %j to %i (%s)', async (durationMin, expected) => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, durationMin: durationMin as never });

      expect(dataSentToCreate(h).durationMin).toBe(expected);
    });

    it('stores no location when none is given', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, valid);

      expect(dataSentToCreate(h).location).toBeNull();
    });

    it.each([null, undefined, ''])('stores null for a %j location', async (location) => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, location });

      expect(dataSentToCreate(h).location).toBeNull();
    });

    // The truthiness check runs before the trim, so whitespace survives as an
    // empty string where an absent location would have been null.
    it('stores an empty string, not null, for a whitespace-only location', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, location: '   ' });

      expect(dataSentToCreate(h).location).toBe('');
    });

    it('trims and bounds the location', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, location: `  ${'מ'.repeat(500)}  ` });

      expect((dataSentToCreate(h).location as string).length).toBe(200);
    });

    it.each([
      [-1, 0, 'negative'],
      [Number.NaN, 0, 'NaN'],
      ['abc' as never, 0, 'non-numeric'],
      [{} as never, 0, 'an object'],
      [undefined, 0, 'missing'],
      [18_000.99, 18_000, 'fractional'],
      [99_999_999_00, PG_INT4_MAX, 'above the int4 ceiling'],
      [Number.MAX_SAFE_INTEGER, PG_INT4_MAX, 'absurd'],
    ])('clamps a price of %j to %i (%s)', async (priceAgorot, expected) => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, priceAgorot: priceAgorot as never });

      expect(dataSentToCreate(h).priceAgorot).toBe(expected);
    });

    it('ignores unknown keys rather than forwarding them to prisma', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        ...valid,
        status: 'done',
        paid: true,
        confirmToken: 'attacker-chosen',
      } as never);

      expect(Object.keys(dataSentToCreate(h)).sort()).toEqual([
        'clientId',
        'coachId',
        'durationMin',
        'location',
        'priceAgorot',
        'startsAt',
        'typeId',
      ]);
    });
  });

  describe('one-off booking', () => {
    it('creates exactly one session and no series', async () => {
      const h = makeHarness();
      const result = await h.service.create(OWNER, valid);

      expect(h.sessionCreate).toHaveBeenCalledTimes(1);
      expect(h.seriesCreate).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('leaves the session outside any series', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, valid);

      expect(dataSentToCreate(h)).not.toHaveProperty('seriesId');
    });

    it.each([false, undefined, 0, ''])(
      'treats repeatWeekly=%j as a one-off',
      async (repeatWeekly) => {
        const h = makeHarness();
        await h.service.create(OWNER, { ...valid, repeatWeekly: repeatWeekly as never });

        expect(h.seriesCreate).not.toHaveBeenCalled();
        expect(h.sessionCreate).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('weekly series', () => {
    const weekly = { ...valid, repeatWeekly: true };

    it('creates one series row plus 12 weekly instances', async () => {
      const h = makeHarness();
      const result = await h.service.create(OWNER, weekly);

      expect(h.seriesCreate).toHaveBeenCalledTimes(1);
      expect(h.sessionCreate).toHaveBeenCalledTimes(SERIES_WEEKS);
      expect(result).toHaveLength(SERIES_WEEKS);
    });

    it('links every instance back to the series', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, weekly);

      const seriesIds = h.sessionCreate.mock.calls.map((c) => c[0].data.seriesId);
      expect(new Set(seriesIds)).toEqual(new Set(['series-1']));
    });

    it('spaces the instances one calendar week apart starting at the requested slot', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...weekly, startsAt: '2026-09-06T15:00:00Z' });

      const starts = h.sessionCreate.mock.calls.map((c) => c[0].data.startsAt as Date);
      const first = new Date('2026-09-06T15:00:00.000Z');

      expect(starts).toHaveLength(SERIES_WEEKS);
      expect(starts[0].getTime()).toBe(first.getTime());

      // Recurrence is anchored to the Israel wall clock, so every instance
      // keeps the same local hour...
      expect(new Set(starts.map(israelTime))).toEqual(new Set([israelTime(first)]));

      // ...which makes the absolute gap a week give or take the one-hour DST
      // shift this 12-week range crosses (Israel leaves DST on 2026-10-25).
      const gaps = starts.slice(1).map((at, i) => at.getTime() - starts[i].getTime());
      for (const gap of gaps) {
        expect([WEEK_MS - 3_600_000, WEEK_MS, WEEK_MS + 3_600_000]).toContain(gap);
      }
      expect(gaps.filter((gap) => gap !== WEEK_MS)).toHaveLength(1);
    });

    it('copies the booking details onto the series row', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        ...weekly,
        typeId: 'padel_double',
        durationMin: 90,
        location: 'מגרש 1',
        priceAgorot: 22_000,
      });

      expect(h.seriesCreate.mock.calls[0][0].data).toMatchObject({
        coachId: OWNER,
        clientId: 'client-1',
        typeId: 'padel_double',
        durationMin: 90,
        location: 'מגרש 1',
        priceAgorot: 22_000,
      });
    });

    it('creates the series before any instance, so nothing dangles', async () => {
      const h = makeHarness();
      const order: string[] = [];
      h.seriesCreate.mockImplementation((async () => {
        order.push('series');
        return { id: 'series-1' };
      }) as never);
      h.sessionCreate.mockImplementation((async () => {
        order.push('session');
        return sessionRow();
      }) as never);

      await h.service.create(OWNER, weekly);

      expect(order[0]).toBe('series');
      expect(order.filter((o) => o === 'series')).toHaveLength(1);
    });
  });

  // startsAt is a UTC instant; weekday/timeLocal on the series row are what the
  // coach sees in Asia/Jerusalem, which is UTC+2 in winter and UTC+3 in summer.
  describe('Asia/Jerusalem derivation on the series row', () => {
    function seriesData(h: ReturnType<typeof makeHarness>): Record<string, unknown> {
      return h.seriesCreate.mock.calls[0][0].data;
    }

    async function seriesFor(startsAt: string) {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, startsAt, repeatWeekly: true });
      return seriesData(h);
    }

    it('reads a winter instant as UTC+2', async () => {
      // 2026-01-04 is a Sunday; 16:00Z is 18:00 IST.
      expect(await seriesFor('2026-01-04T16:00:00Z')).toMatchObject({
        weekday: 0,
        timeLocal: '18:00',
        startsOn: new Date('2026-01-04T00:00:00Z'),
      });
    });

    it('reads a summer instant as UTC+3', async () => {
      // 2026-07-05 is a Sunday; 15:00Z is 18:00 IDT.
      expect(await seriesFor('2026-07-05T15:00:00Z')).toMatchObject({
        weekday: 0,
        timeLocal: '18:00',
        startsOn: new Date('2026-07-05T00:00:00Z'),
      });
    });

    it('shifts the same UTC clock time by an hour across the spring DST jump', async () => {
      // Israel moves to IDT on Fri 2026-03-27; both dates below are Thursdays.
      expect(await seriesFor('2026-03-26T16:00:00Z')).toMatchObject({
        weekday: 4,
        timeLocal: '18:00',
      });
      expect(await seriesFor('2026-04-02T16:00:00Z')).toMatchObject({
        weekday: 4,
        timeLocal: '19:00',
      });
    });

    it('shifts back across the autumn DST return', async () => {
      // Israel returns to IST on Sun 2026-10-25 at 02:00 local.
      expect(await seriesFor('2026-10-22T16:00:00Z')).toMatchObject({
        weekday: 4,
        timeLocal: '19:00',
      });
      expect(await seriesFor('2026-10-29T16:00:00Z')).toMatchObject({
        weekday: 4,
        timeLocal: '18:00',
      });
    });

    it('rolls the weekday and date forward at local midnight', async () => {
      // 22:00Z on Sunday is already 00:00 Monday in Israel.
      expect(await seriesFor('2026-01-04T22:00:00Z')).toMatchObject({
        weekday: 1,
        timeLocal: '00:00',
        startsOn: new Date('2026-01-05T00:00:00Z'),
      });
    });

    it('keeps the previous day for the last half hour before local midnight', async () => {
      expect(await seriesFor('2026-01-04T21:30:00Z')).toMatchObject({
        weekday: 0,
        timeLocal: '23:30',
        startsOn: new Date('2026-01-04T00:00:00Z'),
      });
    });

    it('formats the half hour after local midnight as 00:30, not 24:30', async () => {
      expect(await seriesFor('2026-01-04T22:30:00Z')).toMatchObject({
        weekday: 1,
        timeLocal: '00:30',
      });
    });

    it('wraps Saturday to Sunday at local midnight', async () => {
      // 2026-01-03 is a Saturday; 22:00Z is 00:00 Sunday in Israel.
      expect(await seriesFor('2026-01-03T22:00:00Z')).toMatchObject({
        weekday: 0,
        timeLocal: '00:00',
        startsOn: new Date('2026-01-04T00:00:00Z'),
      });
    });

    // A fixed 7x24h step would drift an hour here, putting the instances an
    // hour away from the timeLocal recorded on their own series row.
    it('keeps every instance at the series wall-clock time across the spring jump', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        ...valid,
        startsAt: '2026-03-26T16:00:00Z',
        repeatWeekly: true,
      });

      const expected = seriesData(h).timeLocal as string;
      const starts = h.sessionCreate.mock.calls.map((c) => c[0].data.startsAt as Date);

      expect(starts.map(israelTime)).toEqual(starts.map(() => expected));
      expect(starts[0].toISOString()).toBe('2026-03-26T16:00:00.000Z');
      expect(starts[1].toISOString()).toBe('2026-04-02T15:00:00.000Z');
    });

    it('keeps every instance at the series wall-clock time across the autumn return', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        ...valid,
        startsAt: '2026-09-06T15:00:00Z',
        repeatWeekly: true,
      });

      const starts = h.sessionCreate.mock.calls.map((c) => c[0].data.startsAt as Date);

      expect(starts.map(israelTime)).toEqual(starts.map(() => '18:00'));
      // Israel leaves DST on 2026-10-25, which is week 7 of this series.
      expect(starts[6].toISOString()).toBe('2026-10-18T15:00:00.000Z');
      expect(starts[7].toISOString()).toBe('2026-10-25T16:00:00.000Z');
    });

    it('keeps every instance on the weekday the coach picked', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        ...valid,
        startsAt: '2026-09-06T15:00:00Z',
        repeatWeekly: true,
      });

      const starts = h.sessionCreate.mock.calls.map((c) => c[0].data.startsAt as Date);

      expect(starts.map(israelWeekday)).toEqual(starts.map(() => 'Sun'));
    });
  });
});

// Exported so the reminders scheduler can materialize future occurrences of a
// series the same way `create` does.
describe('israelWallClockToUtc', () => {
  it.each([
    ['2026-01-04', '18:00', '2026-01-04T16:00:00.000Z', 'winter is UTC+2'],
    ['2026-07-05', '18:00', '2026-07-05T15:00:00.000Z', 'summer is UTC+3'],
    ['2026-03-26', '18:00', '2026-03-26T16:00:00.000Z', 'the day before the spring jump'],
    ['2026-04-02', '18:00', '2026-04-02T15:00:00.000Z', 'the week after the spring jump'],
    ['2026-10-18', '18:00', '2026-10-18T15:00:00.000Z', 'the week before the autumn return'],
    ['2026-10-25', '18:00', '2026-10-25T16:00:00.000Z', 'the day of the autumn return, after 02:00'],
    ['2026-01-05', '00:00', '2026-01-04T22:00:00.000Z', 'local midnight is the previous day in UTC'],
    ['2026-01-04', '23:30', '2026-01-04T21:30:00.000Z', 'the last half hour of the day'],
  ])('maps %s %s to %s (%s)', (dateLocal, timeLocal, expected) => {
    expect(israelWallClockToUtc(dateLocal, timeLocal).toISOString()).toBe(expected);
  });

  it('round-trips every hour of the spring-forward day back to the same wall clock', () => {
    // 02:00–02:59 does not exist on 2026-03-27; every other hour must survive.
    for (let hour = 0; hour < 24; hour += 1) {
      const timeLocal = `${String(hour).padStart(2, '0')}:00`;
      if (timeLocal === '02:00') continue;
      expect(israelTime(israelWallClockToUtc('2026-03-27', timeLocal))).toBe(timeLocal);
    }
  });

  it('round-trips every hour of the fall-back day back to the same wall clock', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const timeLocal = `${String(hour).padStart(2, '0')}:00`;
      expect(israelTime(israelWallClockToUtc('2026-10-25', timeLocal))).toBe(timeLocal);
    }
  });

  it('resolves a wall-clock time that the spring jump skips to the hour after it', () => {
    // 02:30 never happens on 2026-03-27; landing on 03:30 keeps the instant real.
    const at = israelWallClockToUtc('2026-03-27', '02:30');

    expect(at.toISOString()).toBe('2026-03-27T00:30:00.000Z');
    expect(israelTime(at)).toBe('03:30');
  });

  it('resolves a wall-clock time the autumn return repeats to the first occurrence', () => {
    // 01:30 happens twice on 2026-10-25; the earlier (IDT) one is chosen.
    const at = israelWallClockToUtc('2026-10-25', '01:30');

    expect(at.toISOString()).toBe('2026-10-24T23:30:00.000Z');
    expect(israelTime(at)).toBe('01:30');
  });
});

describe('addDaysToIsoDate', () => {
  it.each([
    ['2026-09-06', 7, '2026-09-13'],
    ['2026-09-06', 49, '2026-10-25'],
    ['2026-09-06', 0, '2026-09-06'],
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-12-28', 7, '2027-01-04'],
    ['2028-02-22', 7, '2028-02-29'],
    ['2026-02-22', 7, '2026-03-01'],
    ['2026-03-27', -1, '2026-03-26'],
  ])('steps %s by %i days to %s', (iso, days, expected) => {
    expect(addDaysToIsoDate(iso as string, days as number)).toBe(expected);
  });

  it('is pure calendar arithmetic, unaffected by the DST switch it steps over', () => {
    expect(addDaysToIsoDate('2026-03-26', 7)).toBe('2026-04-02');
    expect(addDaysToIsoDate('2026-10-18', 7)).toBe('2026-10-25');
  });
});

describe('SessionsService.update', () => {
  function dataSentToUpdate(h: ReturnType<typeof makeHarness>): Record<string, unknown> {
    return h.sessionUpdate.mock.calls[0][0].data;
  }

  describe('enum validation', () => {
    it.each(['', 'DONE', 'Confirmed', 'deleted', 'pending ', 'toString', '__proto__'])(
      'rejects the status %j before opening a transaction',
      async (status) => {
        const h = makeHarness();
        await expect(
          h.service.update(OWNER, 'session-1', { status: status as never }),
        ).rejects.toThrow(BadRequestException);
        expect(h.withCoach).not.toHaveBeenCalled();
      },
    );

    it.each([null, 123, {}, ['done']])(
      'rejects the non-string status %j',
      async (status) => {
        const h = makeHarness();
        await expect(
          h.service.update(OWNER, 'session-1', { status: status as never }),
        ).rejects.toThrow(BadRequestException);
      },
    );

    it.each(['pending', 'confirmed', 'cancelled', 'done'] as const)(
      'accepts the status %s',
      async (status) => {
        const h = makeHarness();
        await h.service.update(OWNER, 'session-1', { status });
        expect(dataSentToUpdate(h).status).toBe(status);
      },
    );

    it.each(['', 'ARRIVED', 'noshow', 'no-show', 'late', 'toString'])(
      'rejects the attendance %j before opening a transaction',
      async (attendance) => {
        const h = makeHarness();
        await expect(
          h.service.update(OWNER, 'session-1', { attendance: attendance as never }),
        ).rejects.toThrow(BadRequestException);
        expect(h.withCoach).not.toHaveBeenCalled();
      },
    );

    it.each(['arrived', 'no_show'] as const)('accepts the attendance %s', async (attendance) => {
      const h = makeHarness();
      await h.service.update(OWNER, 'session-1', { attendance });
      expect(dataSentToUpdate(h).attendance).toBe(attendance);
    });

    it('accepts null attendance to clear the mark', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'session-1', { attendance: null });
      expect(dataSentToUpdate(h).attendance).toBeNull();
    });
  });

  describe('scoping and existence', () => {
    it('runs inside an RLS-scoped transaction for the calling coach', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'session-1', { paid: true });
      expect(h.withCoach).toHaveBeenCalledWith(OWNER, expect.any(Function));
    });

    it('checks existence before updating', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'session-1', { paid: true });

      expect(h.sessionFindFirst.mock.calls[0][0].where).toEqual({
        id: 'session-1',
        deletedAt: null,
      });
      expect(h.sessionUpdate.mock.calls[0][0].where).toEqual({ id: 'session-1' });
    });

    it('throws 404 for an unknown session', async () => {
      const h = makeHarness();
      await expect(h.service.update(OWNER, 'nope', { paid: true })).rejects.toThrow(
        NotFoundException,
      );
      expect(h.sessionUpdate).not.toHaveBeenCalled();
    });

    it('throws 404 for a soft-deleted session', async () => {
      const h = makeHarness({
        sessions: [sessionRow({ deletedAt: new Date('2026-02-01T00:00:00.000Z') })],
      });

      await expect(h.service.update(OWNER, 'session-1', { paid: true })).rejects.toThrow(
        NotFoundException,
      );
      expect(h.sessionUpdate).not.toHaveBeenCalled();
    });

    it('throws 404 — never writes — when another coach owns the session', async () => {
      const h = makeHarness({ sessions: [sessionRow({ coachId: OTHER })] });

      await expect(h.service.update(OWNER, 'session-1', { paid: true })).rejects.toThrow(
        NotFoundException,
      );
      expect(h.sessionUpdate).not.toHaveBeenCalled();
    });
  });

  describe('partial updates', () => {
    it('sends only the supplied fields', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'session-1', { paid: true });
      expect(Object.keys(dataSentToUpdate(h))).toEqual(['paid']);
    });

    it('sends nothing for an empty patch', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'session-1', {});
      expect(dataSentToUpdate(h)).toEqual({});
    });

    it('coerces truthy and falsy values on the boolean flags', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'session-1', {
        paid: 'yes' as never,
        reminderSent: 0 as never,
        reminderAnswered: 'false' as never,
      });

      expect(dataSentToUpdate(h)).toEqual({
        paid: true,
        reminderSent: false,
        reminderAnswered: true,
      });
    });

    it('trims and bounds the cancel reason', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'session-1', { cancelReason: `  ${'א'.repeat(5_000)}  ` });

      expect((dataSentToUpdate(h).cancelReason as string).length).toBe(500);
    });

    it('keeps an explicit null cancel reason as null', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'session-1', { cancelReason: null });
      expect(dataSentToUpdate(h).cancelReason).toBeNull();
    });

    it('ignores unknown keys rather than forwarding them to prisma', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'session-1', {
        paid: true,
        priceAgorot: 1,
        clientId: 'someone-else',
        deletedAt: null,
      } as never);

      expect(Object.keys(dataSentToUpdate(h))).toEqual(['paid']);
    });
  });

  describe('confirming implies the reminder was answered', () => {
    it('sets reminderAnswered when the status becomes confirmed', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'session-1', { status: 'confirmed' });

      expect(dataSentToUpdate(h)).toEqual({ status: 'confirmed', reminderAnswered: true });
    });

    it('overrides an explicit reminderAnswered=false alongside confirmed', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'session-1', {
        status: 'confirmed',
        reminderAnswered: false,
      });

      expect(dataSentToUpdate(h).reminderAnswered).toBe(true);
    });

    it('leaves reminderAnswered alone for the other statuses', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'session-1', { status: 'cancelled' });

      expect(dataSentToUpdate(h)).not.toHaveProperty('reminderAnswered');
    });
  });
});

describe('SessionsService.create extra weekday coverage', () => {
  const valid = { clientId: 'client-1', typeId: 'private', startsAt: '2026-09-06T15:00:00Z' };

  it.each([
    ['2026-01-04T16:00:00Z', 0, 'Sunday'],
    ['2026-01-05T16:00:00Z', 1, 'Monday'],
    ['2026-01-06T16:00:00Z', 2, 'Tuesday'],
    ['2026-01-07T16:00:00Z', 3, 'Wednesday'],
    ['2026-01-08T16:00:00Z', 4, 'Thursday'],
    ['2026-01-09T16:00:00Z', 5, 'Friday'],
    ['2026-01-10T16:00:00Z', 6, 'Saturday'],
  ])('stores weekday %i for %s (%s)', async (startsAt, weekday) => {
    const h = makeHarness();
    await h.service.create(OWNER, { ...valid, startsAt, repeatWeekly: true });
    expect(h.seriesCreate.mock.calls[0][0].data.weekday).toBe(weekday);
  });

  it('materializes 12 instances that stay on the same Israel weekday across a year wrap', async () => {
    const h = makeHarness();
    await h.service.create(OWNER, {
      ...valid,
      startsAt: '2026-12-27T16:00:00Z',
      repeatWeekly: true,
    });

    const starts = h.sessionCreate.mock.calls.map((c) => c[0].data.startsAt as Date);
    expect(starts).toHaveLength(12);
    expect(starts.map(israelWeekday)).toEqual(starts.map(() => 'Sun'));
    expect(starts[0].toISOString()).toBe('2026-12-27T16:00:00.000Z');
    expect(starts[1].toISOString()).toBe('2027-01-03T16:00:00.000Z');
  });

  it('keeps 18:00 local through a leap-year February', async () => {
    const h = makeHarness();
    await h.service.create(OWNER, {
      ...valid,
      startsAt: '2028-02-20T16:00:00Z',
      repeatWeekly: true,
    });

    const starts = h.sessionCreate.mock.calls.map((c) => c[0].data.startsAt as Date);
    expect(starts.map(israelTime)).toEqual(starts.map(() => '18:00'));
    expect(starts.some((d) => d.toISOString().startsWith('2028-02-27'))).toBe(true);
  });
});

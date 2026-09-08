import { NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaAdminService } from '../database/prisma-admin.service.js';
import { PublicService } from './public.service.js';

const TOKEN = '3f2b1c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
const CLIENT_ID = '8a7b6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d';
const NOW = new Date('2026-09-06T12:00:00.000Z');

function coach(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coach-1',
    phone: '+972501234567',
    name: 'דני המאמן',
    cancellationPolicy: 'ביטול עד 12 שעות לפני',
    defaultPriceAgorot: 18_000,
    deletedAt: null as Date | null,
    ...overrides,
  };
}

function client(overrides: Record<string, unknown> = {}) {
  return {
    id: CLIENT_ID,
    coachId: 'coach-1',
    name: 'יוסי כהן',
    phone: '+972521112222',
    priceAgorot: 18_000,
    deletedAt: null as Date | null,
    ...overrides,
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    coachId: 'coach-1',
    clientId: CLIENT_ID,
    typeId: 'private',
    startsAt: new Date('2026-09-07T15:00:00.000Z'),
    durationMin: 60,
    location: 'מגרש 1',
    priceAgorot: 18_000,
    status: 'pending' as 'pending' | 'confirmed' | 'cancelled' | 'done',
    paid: false,
    packageId: null as string | null,
    reminderSent: true,
    reminderAnswered: false,
    attendance: null,
    cancelReason: null as string | null,
    confirmToken: TOKEN,
    deletedAt: null as Date | null,
    client: client(),
    coach: coach(),
    ...overrides,
  };
}

type SessionRow = ReturnType<typeof sessionRow>;
type Filter = Record<string, unknown>;

/** Evaluates the subset of prisma `where` operators these queries actually use. */
function matches(row: Record<string, unknown>, where: Filter): boolean {
  return Object.entries(where).every(([field, condition]) => {
    const value = row[field];
    if (
      condition !== null &&
      typeof condition === 'object' &&
      !(condition instanceof Date)
    ) {
      const ops = condition as Record<string, unknown>;
      if ('not' in ops && value === ops.not) return false;
      if ('gt' in ops && !((value as number) > (ops.gt as number)))
        return false;
      if (
        'lt' in ops &&
        !((value as Date).getTime() < (ops.lt as Date).getTime())
      )
        return false;
      if ('in' in ops && !(ops.in as unknown[]).includes(value)) return false;
      return true;
    }
    if (condition instanceof Date)
      return (value as Date)?.getTime() === condition.getTime();
    return value === condition;
  });
}

/**
 * PrismaAdminService bypasses RLS on purpose, so the only thing standing
 * between a stranger and a row is the token in the URL. The fake below is a
 * plain prisma-shaped client, matching how PublicService uses it.
 */
function makeDb(rows: { session?: SessionRow; sessions?: SessionRow[] } = {}) {
  const row = rows.session ?? sessionRow();

  const sessionFindFirst = vi.fn(async ({ where }: { where: Filter }) =>
    matches(row, where) ? row : null,
  );
  const sessionUpdate = vi.fn(
    async ({
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Object.assign(row, data),
  );
  const sessionFindMany = vi.fn(async ({ where }: { where: Filter }) =>
    (rows.sessions ?? []).filter((s) => matches(s, where)),
  );
  const clientFindFirst = vi.fn(async ({ where }: { where: Filter }) =>
    matches(row.client, where) ? { ...row.client, coach: row.coach } : null,
  );
  const executeRaw = vi.fn(async () => 1);

  const db = {
    $executeRaw: executeRaw,
    session: {
      findFirst: sessionFindFirst,
      update: sessionUpdate,
      findMany: sessionFindMany,
    },
    client: { findFirst: clientFindFirst },
    $transaction: vi.fn(
      async (fn: (tx: Record<string, unknown>) => unknown) => fn(db),
    ),
  };

  return {
    row,
    sessionFindFirst,
    sessionUpdate,
    sessionFindMany,
    clientFindFirst,
    service: new PublicService(db as unknown as PrismaAdminService),
  };
}

const NOT_UUID = [
  '',
  '   ',
  'abc',
  'not-a-uuid',
  '3f2b1c4d5e6f4a8b9c0d1e2f3a4b5c6d',
  '3f2b1c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6',
  '3f2b1c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6dd',
  '3f2b1c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6g',
  "' OR 1=1 --",
  '../../etc/passwd',
  '%33f2b1c4d',
  '3f2b1c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d ',
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PublicService.getConfirmInfo', () => {
  it.each(NOT_UUID)(
    'throws 404 for the non-uuid token %j without querying',
    async (token) => {
      const h = makeDb();
      await expect(h.service.getConfirmInfo(token)).rejects.toThrow(
        NotFoundException,
      );
      expect(h.sessionFindFirst).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null])(
    'throws 404 for a %j token without a TypeError',
    async (token) => {
      const h = makeDb();
      await expect(h.service.getConfirmInfo(token as never)).rejects.toThrow(
        NotFoundException,
      );
      expect(h.sessionFindFirst).not.toHaveBeenCalled();
    },
  );

  it('accepts an uppercased token, since links get mangled by some clients', async () => {
    const h = makeDb({
      session: sessionRow({ confirmToken: TOKEN.toUpperCase() }),
    });

    await expect(
      h.service.getConfirmInfo(TOKEN.toUpperCase()),
    ).resolves.toBeDefined();
  });

  it('looks the session up by token and requires it to be live', async () => {
    const h = makeDb();
    await h.service.getConfirmInfo(TOKEN);

    expect(h.sessionFindFirst.mock.calls[0][0].where).toEqual({
      confirmToken: TOKEN,
      deletedAt: null,
    });
  });

  it('throws 404 when no session carries the token', async () => {
    const h = makeDb();
    const otherToken = '11111111-2222-4333-8444-555555555555';

    await expect(h.service.getConfirmInfo(otherToken)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 404 for a soft-deleted session', async () => {
    const h = makeDb({
      session: sessionRow({ deletedAt: new Date('2026-09-05T00:00:00.000Z') }),
    });

    await expect(h.service.getConfirmInfo(TOKEN)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 404 when the client was soft-deleted', async () => {
    const h = makeDb({
      session: sessionRow({
        client: client({ deletedAt: new Date('2026-09-05T00:00:00.000Z') }),
      }),
    });

    await expect(h.service.getConfirmInfo(TOKEN)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 404 when the coach was soft-deleted', async () => {
    const h = makeDb({
      session: sessionRow({
        coach: coach({ deletedAt: new Date('2026-09-05T00:00:00.000Z') }),
      }),
    });

    await expect(h.service.getConfirmInfo(TOKEN)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns the session details the page needs', async () => {
    const h = makeDb();

    await expect(h.service.getConfirmInfo(TOKEN)).resolves.toEqual({
      clientFirstName: 'יוסי',
      coachName: 'דני המאמן',
      startsAt: '2026-09-07T15:00:00.000Z',
      durationMin: 60,
      location: 'מגרש 1',
      status: 'pending',
    });
  });

  it('greets with the first name only', async () => {
    const h = makeDb({
      session: sessionRow({ client: client({ name: 'יוסי בן כהן לוי' }) }),
    });

    await expect(h.service.getConfirmInfo(TOKEN)).resolves.toMatchObject({
      clientFirstName: 'יוסי',
    });
  });

  it('passes a null location through instead of an empty string', async () => {
    const h = makeDb({ session: sessionRow({ location: null }) });

    await expect(h.service.getConfirmInfo(TOKEN)).resolves.toMatchObject({
      location: null,
    });
  });

  describe('leakage', () => {
    it('exposes exactly the documented fields and nothing else', async () => {
      const h = makeDb();
      const info = await h.service.getConfirmInfo(TOKEN);

      expect(Object.keys(info).sort()).toEqual([
        'clientFirstName',
        'coachName',
        'durationMin',
        'location',
        'startsAt',
        'status',
      ]);
    });

    it('leaks no phone numbers', async () => {
      const h = makeDb();
      const body = JSON.stringify(await h.service.getConfirmInfo(TOKEN));

      expect(body).not.toContain('+972501234567');
      expect(body).not.toContain('+972521112222');
    });

    it('leaks no internal ids, tokens or price', async () => {
      const h = makeDb();
      const body = JSON.stringify(await h.service.getConfirmInfo(TOKEN));

      expect(body).not.toContain('coach-1');
      expect(body).not.toContain('session-1');
      expect(body).not.toContain(CLIENT_ID);
      expect(body).not.toContain(TOKEN);
      expect(body).not.toContain('18000');
    });

    it('leaks no surname', async () => {
      const h = makeDb({
        session: sessionRow({ client: client({ name: 'יוסי כהן' }) }),
      });
      const body = JSON.stringify(await h.service.getConfirmInfo(TOKEN));

      expect(body).not.toContain('כהן');
    });
  });
});

describe('PublicService.answer', () => {
  it.each(NOT_UUID)(
    'throws 404 for the non-uuid token %j and writes nothing',
    async (token) => {
      const h = makeDb();
      await expect(h.service.answer(token, 'confirm')).rejects.toThrow(
        NotFoundException,
      );
      expect(h.sessionUpdate).not.toHaveBeenCalled();
    },
  );

  it('throws 404 for a soft-deleted session and writes nothing', async () => {
    const h = makeDb({
      session: sessionRow({ deletedAt: new Date('2026-09-05T00:00:00.000Z') }),
    });

    await expect(h.service.answer(TOKEN, 'confirm')).rejects.toThrow(
      NotFoundException,
    );
    expect(h.sessionUpdate).not.toHaveBeenCalled();
  });

  it('throws 404 for a soft-deleted client and writes nothing', async () => {
    const h = makeDb({
      session: sessionRow({
        client: client({ deletedAt: new Date('2026-09-05T00:00:00.000Z') }),
      }),
    });

    await expect(h.service.answer(TOKEN, 'confirm')).rejects.toThrow(
      NotFoundException,
    );
    expect(h.sessionUpdate).not.toHaveBeenCalled();
  });

  it('throws 404 for a soft-deleted coach and writes nothing', async () => {
    const h = makeDb({
      session: sessionRow({
        coach: coach({ deletedAt: new Date('2026-09-05T00:00:00.000Z') }),
      }),
    });

    await expect(h.service.answer(TOKEN, 'confirm')).rejects.toThrow(
      NotFoundException,
    );
    expect(h.sessionUpdate).not.toHaveBeenCalled();
  });

  describe('confirm', () => {
    it('sets the status to confirmed and marks the reminder answered', async () => {
      const h = makeDb();
      await h.service.answer(TOKEN, 'confirm');

      expect(h.sessionUpdate.mock.calls[0][0]).toEqual({
        where: { id: 'session-1' },
        data: {
          status: 'confirmed',
          cancelReason: null,
          reminderAnswered: true,
        },
      });
    });

    it('clears a cancel reason left by an earlier decline', async () => {
      const h = makeDb({
        session: sessionRow({
          status: 'cancelled',
          cancelReason: 'ביטל/ה דרך הקישור',
        }),
      });

      const info = await h.service.answer(TOKEN, 'confirm');

      expect(h.row.cancelReason).toBeNull();
      expect(info.status).toBe('confirmed');
    });

    it('reports the new status back to the page', async () => {
      const h = makeDb();

      await expect(h.service.answer(TOKEN, 'confirm')).resolves.toMatchObject({
        status: 'confirmed',
      });
    });

    it('is idempotent when the client taps confirm twice', async () => {
      const h = makeDb();
      await h.service.answer(TOKEN, 'confirm');
      const second = await h.service.answer(TOKEN, 'confirm');

      expect(second.status).toBe('confirmed');
      expect(h.row.status).toBe('confirmed');
    });
  });

  describe('decline', () => {
    it('cancels with a reason the coach can see and marks the reminder answered', async () => {
      const h = makeDb();
      await h.service.answer(TOKEN, 'decline');

      expect(h.sessionUpdate.mock.calls[0][0]).toEqual({
        where: { id: 'session-1' },
        data: {
          status: 'cancelled',
          cancelReason: 'ביטל/ה דרך הקישור',
          reminderAnswered: true,
        },
      });
    });

    it('reports the new status back to the page', async () => {
      const h = makeDb();

      await expect(h.service.answer(TOKEN, 'decline')).resolves.toMatchObject({
        status: 'cancelled',
      });
    });

    it('lets a client switch from confirmed to cancelled while the session is still ahead', async () => {
      const h = makeDb({ session: sessionRow({ status: 'confirmed' }) });

      await expect(h.service.answer(TOKEN, 'decline')).resolves.toMatchObject({
        status: 'cancelled',
      });
    });
  });

  describe('the answer window closes when the session ends', () => {
    it('accepts an answer with the session still in the future', async () => {
      const h = makeDb({
        session: sessionRow({ startsAt: new Date('2026-09-06T13:00:00.000Z') }),
      });

      await h.service.answer(TOKEN, 'confirm');

      expect(h.sessionUpdate).toHaveBeenCalledTimes(1);
    });

    it('accepts an answer while the session is under way', async () => {
      // Started 30 min ago, runs 60 min — still in progress at NOW.
      const h = makeDb({
        session: sessionRow({
          startsAt: new Date('2026-09-06T11:30:00.000Z'),
          durationMin: 60,
        }),
      });

      await h.service.answer(TOKEN, 'confirm');

      expect(h.sessionUpdate).toHaveBeenCalledTimes(1);
    });

    it('accepts an answer in the final minute before the session ends', async () => {
      const h = makeDb({
        session: sessionRow({
          startsAt: new Date('2026-09-06T11:01:00.000Z'),
          durationMin: 60,
        }),
      });

      await h.service.answer(TOKEN, 'confirm');

      expect(h.sessionUpdate).toHaveBeenCalledTimes(1);
    });

    it('refuses an answer once the session has ended', async () => {
      const h = makeDb({
        session: sessionRow({
          startsAt: new Date('2026-09-06T10:00:00.000Z'),
          durationMin: 60,
        }),
      });

      await h.service.answer(TOKEN, 'confirm');

      expect(h.sessionUpdate).not.toHaveBeenCalled();
      expect(h.row.status).toBe('pending');
    });

    it('refuses an answer for a session from last week', async () => {
      const h = makeDb({
        session: sessionRow({ startsAt: new Date('2026-08-30T15:00:00.000Z') }),
      });

      await h.service.answer(TOKEN, 'decline');

      expect(h.sessionUpdate).not.toHaveBeenCalled();
    });

    it('still reports the unchanged status rather than erroring', async () => {
      const h = makeDb({
        session: sessionRow({
          startsAt: new Date('2026-08-30T15:00:00.000Z'),
          status: 'done',
        }),
      });

      await expect(h.service.answer(TOKEN, 'confirm')).resolves.toMatchObject({
        status: 'done',
      });
    });

    it('refuses to reopen a session the coach already marked done', async () => {
      const h = makeDb({
        session: sessionRow({
          startsAt: new Date('2026-09-07T15:00:00.000Z'),
          status: 'done',
        }),
      });

      await h.service.answer(TOKEN, 'confirm');

      expect(h.sessionUpdate).not.toHaveBeenCalled();
      expect(h.row.status).toBe('done');
    });

    it('refuses to cancel a session the coach already marked done', async () => {
      const h = makeDb({
        session: sessionRow({
          startsAt: new Date('2026-09-07T15:00:00.000Z'),
          status: 'done',
        }),
      });

      await h.service.answer(TOKEN, 'decline');

      expect(h.sessionUpdate).not.toHaveBeenCalled();
    });
  });

  it('leaks nothing extra on the answer response', async () => {
    const h = makeDb();
    const info = await h.service.answer(TOKEN, 'confirm');

    expect(Object.keys(info).sort()).toEqual([
      'clientFirstName',
      'coachName',
      'durationMin',
      'location',
      'startsAt',
      'status',
    ]);
    expect(JSON.stringify(info)).not.toContain('+972501234567');
  });
});

describe('PublicService.getPayInfo', () => {
  function debtSession(overrides: Record<string, unknown> = {}) {
    return sessionRow({
      status: 'done',
      paid: false,
      packageId: null,
      startsAt: new Date('2026-09-01T15:00:00.000Z'),
      ...overrides,
    });
  }

  it.each(NOT_UUID)(
    'throws 404 for the non-uuid client id %j without querying',
    async (id) => {
      const h = makeDb();
      await expect(h.service.getPayInfo(id)).rejects.toThrow(NotFoundException);
      expect(h.clientFindFirst).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null])(
    'throws 404 for a %j client id without a TypeError',
    async (id) => {
      const h = makeDb();
      await expect(h.service.getPayInfo(id as never)).rejects.toThrow(
        NotFoundException,
      );
      expect(h.clientFindFirst).not.toHaveBeenCalled();
    },
  );

  it('looks the client up by id and requires it to be live', async () => {
    const h = makeDb();
    await h.service.getPayInfo(CLIENT_ID);

    expect(h.clientFindFirst.mock.calls[0][0].where).toEqual({
      id: CLIENT_ID,
      deletedAt: null,
    });
  });

  it('throws 404 for an unknown client', async () => {
    const h = makeDb();
    const otherId = '11111111-2222-4333-8444-555555555555';

    await expect(h.service.getPayInfo(otherId)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 404 for a soft-deleted client', async () => {
    const h = makeDb({
      session: sessionRow({
        client: client({ deletedAt: new Date('2026-09-05T00:00:00.000Z') }),
      }),
    });

    await expect(h.service.getPayInfo(CLIENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 404 for a soft-deleted coach', async () => {
    const h = makeDb({
      session: sessionRow({
        coach: coach({ deletedAt: new Date('2026-09-05T00:00:00.000Z') }),
      }),
    });

    await expect(h.service.getPayInfo(CLIENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('greets with the first name and names the coach', async () => {
    const h = makeDb();

    await expect(h.service.getPayInfo(CLIENT_ID)).resolves.toMatchObject({
      clientFirstName: 'יוסי',
      coachName: 'דני המאמן',
    });
  });

  it('reports zero debt with an empty list when nothing is owed', async () => {
    const h = makeDb({ sessions: [] });

    await expect(h.service.getPayInfo(CLIENT_ID)).resolves.toMatchObject({
      sessions: [],
      totalAgorot: 0,
    });
  });

  describe('which sessions count as debt', () => {
    it('counts a past, unpaid, chargeable, non-package session', async () => {
      const h = makeDb({ sessions: [debtSession({ id: 'owed' })] });

      const info = await h.service.getPayInfo(CLIENT_ID);

      expect(info.sessions.map((s) => s.id)).toEqual(['owed']);
    });

    it('counts a past confirmed session, since it is treated as done', async () => {
      const h = makeDb({
        sessions: [debtSession({ id: 'owed', status: 'confirmed' })],
      });

      const info = await h.service.getPayInfo(CLIENT_ID);

      expect(info.sessions.map((s) => s.id)).toEqual(['owed']);
    });

    it.each([
      [
        'a future session',
        { id: 'x', startsAt: new Date('2026-09-20T15:00:00.000Z') },
      ],
      ['an already paid session', { id: 'x', paid: true }],
      ['a session covered by a package', { id: 'x', packageId: 'package-1' }],
      ['a free session', { id: 'x', priceAgorot: 0 }],
      ['a cancelled session', { id: 'x', status: 'cancelled' }],
      ['a session still pending', { id: 'x', status: 'pending' }],
      [
        'a soft-deleted session',
        { id: 'x', deletedAt: new Date('2026-09-02T00:00:00.000Z') },
      ],
    ])('does not count %s', async (_label, overrides) => {
      const h = makeDb({
        sessions: [debtSession(overrides as Record<string, unknown>)],
      });

      await expect(h.service.getPayInfo(CLIENT_ID)).resolves.toMatchObject({
        sessions: [],
        totalAgorot: 0,
      });
    });

    it('picks only the debt out of a mixed history', async () => {
      const h = makeDb({
        sessions: [
          debtSession({ id: 'owed-1', priceAgorot: 18_000 }),
          debtSession({ id: 'owed-2', priceAgorot: 22_000 }),
          debtSession({ id: 'paid', paid: true }),
          debtSession({
            id: 'future',
            startsAt: new Date('2026-09-20T15:00:00.000Z'),
          }),
          debtSession({ id: 'package', packageId: 'package-1' }),
          debtSession({ id: 'free', priceAgorot: 0 }),
          debtSession({ id: 'cancelled', status: 'cancelled' }),
          debtSession({ id: 'pending', status: 'pending' }),
          debtSession({
            id: 'deleted',
            deletedAt: new Date('2026-09-02T00:00:00.000Z'),
          }),
        ],
      });

      const info = await h.service.getPayInfo(CLIENT_ID);

      expect(info.sessions.map((s) => s.id)).toEqual(['owed-1', 'owed-2']);
      expect(info.totalAgorot).toBe(40_000);
    });

    it('scopes the query to this client only', async () => {
      const h = makeDb();
      await h.service.getPayInfo(CLIENT_ID);

      expect(h.sessionFindMany.mock.calls[0][0].where).toMatchObject({
        clientId: CLIENT_ID,
      });
    });

    it('cuts the "past" boundary at the current instant', async () => {
      const h = makeDb();
      await h.service.getPayInfo(CLIENT_ID);

      const where = h.sessionFindMany.mock.calls[0][0].where as {
        startsAt: { lt: Date };
      };
      expect(where.startsAt.lt.getTime()).toBe(NOW.getTime());
    });

    it('lists the newest debt first', async () => {
      const h = makeDb();
      await h.service.getPayInfo(CLIENT_ID);

      expect(h.sessionFindMany.mock.calls[0][0]).toMatchObject({
        orderBy: { startsAt: 'desc' },
      });
    });
  });

  describe('debt math', () => {
    it('totals exactly the sessions it listed', async () => {
      const h = makeDb({
        sessions: [
          debtSession({ id: 'a', priceAgorot: 18_000 }),
          debtSession({ id: 'b', priceAgorot: 22_500 }),
          debtSession({ id: 'c', priceAgorot: 1 }),
        ],
      });

      const info = await h.service.getPayInfo(CLIENT_ID);

      expect(info.totalAgorot).toBe(
        info.sessions.reduce((sum, s) => sum + s.priceAgorot, 0),
      );
      expect(info.totalAgorot).toBe(40_501);
    });

    it('stays an integer count of agorot', async () => {
      const h = makeDb({
        sessions: [
          debtSession({ id: 'a', priceAgorot: 18_333 }),
          debtSession({ id: 'b', priceAgorot: 18_334 }),
        ],
      });

      const info = await h.service.getPayInfo(CLIENT_ID);

      expect(Number.isInteger(info.totalAgorot)).toBe(true);
      expect(info.totalAgorot).toBe(36_667);
    });
  });

  describe('leakage', () => {
    it('exposes exactly the documented fields and nothing else', async () => {
      const h = makeDb({ sessions: [debtSession()] });
      const info = await h.service.getPayInfo(CLIENT_ID);

      expect(Object.keys(info).sort()).toEqual([
        'clientFirstName',
        'coachName',
        'sessions',
        'totalAgorot',
      ]);
      expect(Object.keys(info.sessions[0]).sort()).toEqual([
        'id',
        'priceAgorot',
        'startsAt',
      ]);
    });

    it('leaks no phone numbers, coach id or surname', async () => {
      const h = makeDb({ sessions: [debtSession()] });
      const body = JSON.stringify(await h.service.getPayInfo(CLIENT_ID));

      expect(body).not.toContain('+972501234567');
      expect(body).not.toContain('+972521112222');
      expect(body).not.toContain('coach-1');
      expect(body).not.toContain('כהן');
    });

    it('leaks no cancellation policy or other coach settings', async () => {
      const h = makeDb({ sessions: [debtSession()] });
      const body = JSON.stringify(await h.service.getPayInfo(CLIENT_ID));

      expect(body).not.toContain('ביטול עד 12 שעות לפני');
    });

    it('leaks no confirm token or reminder flags on a session line', async () => {
      const h = makeDb({
        sessions: [debtSession({ confirmToken: TOKEN, reminderSent: true })],
      });
      const info = await h.service.getPayInfo(CLIENT_ID);

      expect(JSON.stringify(info.sessions)).not.toContain(TOKEN);
      expect(JSON.stringify(info.sessions)).not.toContain('reminder');
    });
  });

  describe('debt boundary at "now"', () => {
    it('excludes a session that starts exactly now (startsAt is strictly lt)', async () => {
      const h = makeDb({
        sessions: [debtSession({ id: 'now', startsAt: NOW })],
      });

      await expect(h.service.getPayInfo(CLIENT_ID)).resolves.toMatchObject({
        sessions: [],
        totalAgorot: 0,
      });
    });

    it('includes a session that started one millisecond ago', async () => {
      const h = makeDb({
        sessions: [
          debtSession({
            id: 'just-past',
            startsAt: new Date(NOW.getTime() - 1),
          }),
        ],
      });

      await expect(h.service.getPayInfo(CLIENT_ID)).resolves.toMatchObject({
        sessions: [{ id: 'just-past' }],
        totalAgorot: 18_000,
      });
    });

    it('asks prisma for the exact debt rule from SPEC', async () => {
      const h = makeDb();
      await h.service.getPayInfo(CLIENT_ID);

      expect(h.sessionFindMany.mock.calls[0][0].where).toEqual({
        clientId: CLIENT_ID,
        deletedAt: null,
        paid: false,
        packageId: null,
        priceAgorot: { gt: 0 },
        status: { in: ['confirmed', 'done'] },
        startsAt: { lt: NOW },
      });
    });
  });
});

describe('PublicService extra token and name edges', () => {
  it.each([
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '3F2B1C4D-5E6F-4A8B-9C0D-1E2F3A4B5C6D',
    '3f2b1c4d-5e6f-1a8b-9c0d-1e2f3a4b5c6d',
    '3f2b1c4d-5e6f-4a8b-ac0d-1e2f3a4b5c6d',
  ])('treats %s as a well-formed UUID and queries for it', async (token) => {
    const h = makeDb();
    await h.service.getConfirmInfo(token).catch(() => undefined);
    expect(h.sessionFindFirst).toHaveBeenCalled();
    expect(h.sessionFindFirst.mock.calls[0][0].where.confirmToken).toBe(token);
  });

  it.each([
    '{3f2b1c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d}',
    'urn:uuid:3f2b1c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
    '3f2b1c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d\n',
    ' 3f2b1c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
  ])('rejects the decorated token %j without querying', async (token) => {
    const h = makeDb();
    await expect(h.service.getConfirmInfo(token)).rejects.toThrow(
      NotFoundException,
    );
    expect(h.sessionFindFirst).not.toHaveBeenCalled();
  });

  it('greets a single-word name as-is', async () => {
    const h = makeDb({
      session: sessionRow({ client: client({ name: 'יוסי' }) }),
    });
    await expect(h.service.getConfirmInfo(TOKEN)).resolves.toMatchObject({
      clientFirstName: 'יוסי',
    });
  });

  it('greets an empty name as an empty string rather than crashing', async () => {
    const h = makeDb({ session: sessionRow({ client: client({ name: '' }) }) });
    await expect(h.service.getConfirmInfo(TOKEN)).resolves.toMatchObject({
      clientFirstName: '',
    });
  });

  it.fails('rejects an expired confirm token', async () => {
    const h = makeDb({
      session: sessionRow({
        confirmExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
    });

    await expect(h.service.getConfirmInfo(TOKEN)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('still accepts an answer at the exact instant the session ends (ended is strict <)', async () => {
    const h = makeDb({
      session: sessionRow({
        startsAt: new Date('2026-09-06T11:00:00.000Z'),
        durationMin: 60,
      }),
    });

    await h.service.answer(TOKEN, 'confirm');

    expect(h.sessionUpdate).toHaveBeenCalledTimes(1);
  });

  it('accepts an answer one millisecond before the session ends', async () => {
    const h = makeDb({
      session: sessionRow({
        startsAt: new Date('2026-09-06T11:00:00.001Z'),
        durationMin: 60,
      }),
    });

    await h.service.answer(TOKEN, 'confirm');

    expect(h.sessionUpdate).toHaveBeenCalledTimes(1);
  });
});

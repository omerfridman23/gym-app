import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { PaymentsService } from './payments.service.js';

const PG_INT4_MAX = 2_147_483_647;
const OWNER = 'coach-1';
const OTHER = 'coach-2';

function clientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'client-1',
    coachId: OWNER,
    name: 'דני לוי',
    deletedAt: null as Date | null,
    ...overrides,
  };
}

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-1',
    coachId: OWNER,
    clientId: 'client-1',
    amountAgorot: 18_000,
    method: 'cash',
    paidAt: new Date('2026-09-01T09:00:00.000Z'),
    createdAt: new Date('2026-09-01T09:00:00.000Z'),
    deletedAt: null as Date | null,
    ...overrides,
  };
}

type Where = { id?: string; deletedAt?: Date | null };

/** Stand-in for postgres RLS: a transaction only sees its own coach rows. */
function makeHarness(
  rows: {
    clients?: ReturnType<typeof clientRow>[];
    payments?: ReturnType<typeof paymentRow>[];
  } = {},
) {
  const clients = rows.clients ?? [clientRow()];
  const payments = rows.payments ?? [paymentRow()];
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
  const paymentFindMany = vi.fn(async ({ where }: { where?: Where }) => visible(payments, where));
  const paymentCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
    paymentRow(data),
  );
  const sessionUpdateMany = vi.fn(
    async (args: {
      where: { id: { in: string[] }; clientId: string; deletedAt: Date | null };
      data: { paid: boolean };
    }) => ({ count: args.where.id.in.length }),
  );

  const tx = {
    client: { findFirst: clientFindFirst },
    payment: { findMany: paymentFindMany, create: paymentCreate },
    session: { updateMany: sessionUpdateMany },
  };
  const withCoach = vi.fn((coachId: string, fn: (t: typeof tx) => unknown) => {
    scopedCoachId = coachId;
    return fn(tx);
  });

  return {
    withCoach,
    clientFindFirst,
    paymentFindMany,
    paymentCreate,
    sessionUpdateMany,
    service: new PaymentsService({ withCoach } as unknown as PrismaService),
  };
}

describe('PaymentsService.list', () => {
  it('runs inside an RLS-scoped transaction for the calling coach', async () => {
    const h = makeHarness();
    await h.service.list(OWNER);
    expect(h.withCoach).toHaveBeenCalledWith(OWNER, expect.any(Function));
  });

  it('excludes soft-deleted payments', async () => {
    const h = makeHarness({
      payments: [
        paymentRow({ id: 'live' }),
        paymentRow({ id: 'gone', deletedAt: new Date('2026-09-02T00:00:00.000Z') }),
      ],
    });

    const result = await h.service.list(OWNER);

    expect(h.paymentFindMany.mock.calls[0][0].where).toEqual({ deletedAt: null });
    expect(result.map((p) => p.id)).toEqual(['live']);
  });

  it('shows the newest payment first', async () => {
    const h = makeHarness();
    await h.service.list(OWNER);
    expect(h.paymentFindMany.mock.calls[0][0]).toMatchObject({ orderBy: { paidAt: 'desc' } });
  });

  it('never returns another coach payments', async () => {
    const h = makeHarness({
      payments: [paymentRow({ id: 'mine' }), paymentRow({ id: 'theirs', coachId: OTHER })],
    });

    await expect(h.service.list(OWNER)).resolves.toMatchObject([{ id: 'mine' }]);
  });
});

describe('PaymentsService.create', () => {
  const valid = { clientId: 'client-1', amountAgorot: 18_000, method: 'cash' as const };

  function dataSentToCreate(h: ReturnType<typeof makeHarness>): Record<string, unknown> {
    return h.paymentCreate.mock.calls[0][0].data;
  }

  describe('amount validation', () => {
    it.each([
      [0, 'zero'],
      [-1, 'negative'],
      [-18_000, 'a negative charge'],
      [0.4, 'rounds down to zero'],
      [Number.NaN, 'NaN'],
      ['abc', 'a non-numeric string'],
      [{}, 'an object'],
      [null, 'null'],
      [undefined, 'missing'],
      [PG_INT4_MAX + 1, 'just past the int4 ceiling'],
      [99_999_999_00, 'above the int4 ceiling'],
      [Number.POSITIVE_INFINITY, 'Infinity'],
      [Number.MAX_SAFE_INTEGER, 'absurd'],
    ])('rejects an amount of %j (%s) before opening a transaction', async (amountAgorot) => {
      const h = makeHarness();
      await expect(
        h.service.create(OWNER, { ...valid, amountAgorot: amountAgorot as never }),
      ).rejects.toThrow(BadRequestException);
      expect(h.withCoach).not.toHaveBeenCalled();
    });

    it('accepts the smallest possible payment of one agora', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, amountAgorot: 1 });
      expect(dataSentToCreate(h).amountAgorot).toBe(1);
    });

    it('accepts exactly the int4 ceiling', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, amountAgorot: PG_INT4_MAX });
      expect(dataSentToCreate(h).amountAgorot).toBe(PG_INT4_MAX);
    });

    it('truncates fractional agorot rather than letting them reach the column', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, amountAgorot: 18_000.99 });
      expect(dataSentToCreate(h).amountAgorot).toBe(18_000);
    });

    it('accepts a numeric string, since nothing validates the body', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, amountAgorot: '18000' as never });
      expect(dataSentToCreate(h).amountAgorot).toBe(18_000);
    });
  });

  describe('method validation', () => {
    it.each(['cash', 'bit', 'transfer', 'card'] as const)('accepts %s', async (method) => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, method });
      expect(dataSentToCreate(h).method).toBe(method);
    });

    it.each(['', 'CASH', 'Cash', 'paypal', 'toString', '__proto__', 'constructor'])(
      'rejects the method %j before opening a transaction',
      async (method) => {
        const h = makeHarness();
        await expect(
          h.service.create(OWNER, { ...valid, method: method as never }),
        ).rejects.toThrow(BadRequestException);
        expect(h.withCoach).not.toHaveBeenCalled();
      },
    );

    it.each([undefined, null, 1, {}, ['cash']])(
      'rejects the non-string method %j',
      async (method) => {
        const h = makeHarness();
        await expect(
          h.service.create(OWNER, { ...valid, method: method as never }),
        ).rejects.toThrow(BadRequestException);
      },
    );
  });

  describe('client validation and scoping', () => {
    it.each(['', undefined, null])('rejects a %j clientId', async (clientId) => {
      const h = makeHarness();
      await expect(
        h.service.create(OWNER, { ...valid, clientId: clientId as never }),
      ).rejects.toThrow(BadRequestException);
      expect(h.withCoach).not.toHaveBeenCalled();
    });

    it('rejects a null body without a TypeError', async () => {
      const h = makeHarness();
      await expect(h.service.create(OWNER, null as never)).rejects.toThrow(BadRequestException);
    });

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
      expect(h.paymentCreate).not.toHaveBeenCalled();
    });

    it('throws 404 for a soft-deleted client', async () => {
      const h = makeHarness({
        clients: [clientRow({ deletedAt: new Date('2026-02-01T00:00:00.000Z') })],
      });

      await expect(h.service.create(OWNER, valid)).rejects.toThrow(NotFoundException);
      expect(h.paymentCreate).not.toHaveBeenCalled();
    });

    it('throws 404 — records nothing — when the client belongs to another coach', async () => {
      const h = makeHarness({ clients: [clientRow({ coachId: OTHER })] });

      await expect(h.service.create(OWNER, valid)).rejects.toThrow(NotFoundException);
      expect(h.paymentCreate).not.toHaveBeenCalled();
      expect(h.sessionUpdateMany).not.toHaveBeenCalled();
    });

    it('stamps the coachId from the session and the clientId from the verified row', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, coachId: OTHER } as never);

      expect(dataSentToCreate(h)).toMatchObject({ coachId: OWNER, clientId: 'client-1' });
    });

    it('writes only the payment columns it owns', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, paidAt: new Date(0), id: 'chosen' } as never);

      expect(Object.keys(dataSentToCreate(h)).sort()).toEqual([
        'amountAgorot',
        'clientId',
        'coachId',
        'method',
      ]);
    });
  });

  describe('settling sessions', () => {
    it('marks the listed sessions paid in the same transaction', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, sessionIds: ['s1', 's2'] });

      expect(h.sessionUpdateMany).toHaveBeenCalledTimes(1);
      expect(h.sessionUpdateMany.mock.calls[0][0]).toEqual({
        where: { id: { in: ['s1', 's2'] }, clientId: 'client-1', deletedAt: null },
        data: { paid: true },
      });
    });

    it('creates the payment before settling, so a failed settle cannot orphan sessions', async () => {
      const h = makeHarness();
      const order: string[] = [];
      h.paymentCreate.mockImplementation((async () => {
        order.push('payment');
        return paymentRow();
      }) as never);
      h.sessionUpdateMany.mockImplementation((async () => {
        order.push('settle');
        return { count: 2 };
      }) as never);

      await h.service.create(OWNER, { ...valid, sessionIds: ['s1'] });

      expect(order).toEqual(['payment', 'settle']);
    });

    it('scopes the settle to the paying client, so another client sessions cannot be cleared', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, sessionIds: ['someone-elses-session'] });

      expect(h.sessionUpdateMany.mock.calls[0][0].where).toMatchObject({ clientId: 'client-1' });
    });

    it('does not touch sessions when none are listed', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, valid);
      expect(h.sessionUpdateMany).not.toHaveBeenCalled();
    });

    it.each([[[]], [undefined], ['s1' as never], [{} as never], [null as never]])(
      'does not touch sessions for a sessionIds of %j',
      async (sessionIds) => {
        const h = makeHarness();
        await h.service.create(OWNER, { ...valid, sessionIds });
        expect(h.sessionUpdateMany).not.toHaveBeenCalled();
      },
    );

    it('drops non-string entries instead of handing them to prisma', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        ...valid,
        sessionIds: ['s1', 42, null, undefined, {}, ['s2'], 's3'] as never,
      });

      expect(h.sessionUpdateMany.mock.calls[0][0].where.id).toEqual({ in: ['s1', 's3'] });
    });

    it('caps the batch at 200 ids', async () => {
      const h = makeHarness();
      const sessionIds = Array.from({ length: 5_000 }, (_, i) => `s${i}`);

      await h.service.create(OWNER, { ...valid, sessionIds });

      expect(h.sessionUpdateMany.mock.calls[0][0].where.id.in).toHaveLength(200);
    });

    it('excludes soft-deleted sessions from the settle', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, sessionIds: ['s1'] });

      expect(h.sessionUpdateMany.mock.calls[0][0].where).toMatchObject({ deletedAt: null });
    });
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { PackagesService } from './packages.service.js';

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

function packageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'package-1',
    coachId: OWNER,
    clientId: 'client-1',
    totalSessions: 10,
    purchasedAgorot: 150_000,
    purchasedAt: new Date('2026-09-01T09:00:00.000Z'),
    createdAt: new Date('2026-09-01T09:00:00.000Z'),
    deletedAt: null as Date | null,
    ...overrides,
  };
}

type Where = { id?: string; deletedAt?: Date | null };
type GroupByRow = { packageId: string | null; _count: { _all: number } };

/** Stand-in for postgres RLS: a transaction only sees its own coach rows. */
function makeHarness(
  rows: {
    clients?: ReturnType<typeof clientRow>[];
    packages?: ReturnType<typeof packageRow>[];
    used?: GroupByRow[];
  } = {},
) {
  const clients = rows.clients ?? [clientRow()];
  const packages = rows.packages ?? [packageRow()];
  let scopedCoachId = '';

  const visible = <
    T extends { coachId: string; id: string; deletedAt: Date | null },
  >(
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
  const packageFindMany = vi.fn(async ({ where }: { where?: Where }) =>
    visible(packages, where),
  );
  const packageCreate = vi.fn(
    async ({ data }: { data: Record<string, unknown> }) => packageRow(data),
  );
  const sessionGroupBy = vi.fn(
    async (_args: Record<string, unknown>) => rows.used ?? [],
  );

  const tx = {
    client: { findFirst: clientFindFirst },
    package: { findMany: packageFindMany, create: packageCreate },
    session: { groupBy: sessionGroupBy },
  };
  const withCoach = vi.fn((coachId: string, fn: (t: typeof tx) => unknown) => {
    scopedCoachId = coachId;
    return fn(tx);
  });

  return {
    withCoach,
    clientFindFirst,
    packageFindMany,
    packageCreate,
    sessionGroupBy,
    service: new PackagesService({ withCoach } as unknown as PrismaService),
  };
}

describe('PackagesService.list', () => {
  it('runs inside an RLS-scoped transaction for the calling coach', async () => {
    const h = makeHarness();
    await h.service.list(OWNER);
    expect(h.withCoach).toHaveBeenCalledWith(OWNER, expect.any(Function));
  });

  it('excludes soft-deleted packages', async () => {
    const h = makeHarness({
      packages: [
        packageRow({ id: 'live' }),
        packageRow({
          id: 'gone',
          deletedAt: new Date('2026-09-02T00:00:00.000Z'),
        }),
      ],
    });

    const result = await h.service.list(OWNER);

    expect(h.packageFindMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
    });
    expect(result.map((p) => p.id)).toEqual(['live']);
  });

  it('shows the newest purchase first', async () => {
    const h = makeHarness();
    await h.service.list(OWNER);
    expect(h.packageFindMany.mock.calls[0][0]).toMatchObject({
      orderBy: { purchasedAt: 'desc' },
    });
  });

  it('never returns another coach packages', async () => {
    const h = makeHarness({
      packages: [
        packageRow({ id: 'mine' }),
        packageRow({ id: 'theirs', coachId: OTHER }),
      ],
    });

    await expect(h.service.list(OWNER)).resolves.toMatchObject([
      { id: 'mine' },
    ]);
  });

  describe('remaining sessions', () => {
    it('is the full total for an untouched package', async () => {
      const h = makeHarness({
        packages: [packageRow({ totalSessions: 10 })],
        used: [],
      });

      await expect(h.service.list(OWNER)).resolves.toMatchObject([
        { remaining: 10 },
      ]);
    });

    it('subtracts the sessions already drawn from the package', async () => {
      const h = makeHarness({
        packages: [packageRow({ totalSessions: 10 })],
        used: [{ packageId: 'package-1', _count: { _all: 4 } }],
      });

      await expect(h.service.list(OWNER)).resolves.toMatchObject([
        { remaining: 6 },
      ]);
    });

    it('reaches exactly zero on a fully used package', async () => {
      const h = makeHarness({
        packages: [packageRow({ totalSessions: 10 })],
        used: [{ packageId: 'package-1', _count: { _all: 10 } }],
      });

      await expect(h.service.list(OWNER)).resolves.toMatchObject([
        { remaining: 0 },
      ]);
    });

    it('never goes negative when more sessions were booked than bought', async () => {
      const h = makeHarness({
        packages: [packageRow({ totalSessions: 10 })],
        used: [{ packageId: 'package-1', _count: { _all: 14 } }],
      });

      await expect(h.service.list(OWNER)).resolves.toMatchObject([
        { remaining: 0 },
      ]);
    });

    it('attributes usage per package rather than in aggregate', async () => {
      const h = makeHarness({
        packages: [
          packageRow({ id: 'package-1', totalSessions: 10 }),
          packageRow({ id: 'package-2', totalSessions: 5 }),
        ],
        used: [
          { packageId: 'package-1', _count: { _all: 3 } },
          { packageId: 'package-2', _count: { _all: 5 } },
        ],
      });

      const result = await h.service.list(OWNER);

      expect(result.map((p) => [p.id, p.remaining])).toEqual([
        ['package-1', 7],
        ['package-2', 0],
      ]);
    });

    it('ignores usage rows for packages it cannot see', async () => {
      const h = makeHarness({
        packages: [packageRow({ totalSessions: 10 })],
        used: [
          { packageId: 'package-1', _count: { _all: 2 } },
          { packageId: 'someone-elses-package', _count: { _all: 99 } },
        ],
      });

      await expect(h.service.list(OWNER)).resolves.toMatchObject([
        { remaining: 8 },
      ]);
    });

    it('keeps the package fields alongside remaining', async () => {
      const h = makeHarness({ used: [] });

      const [pkg] = await h.service.list(OWNER);

      expect(pkg).toMatchObject({
        id: 'package-1',
        clientId: 'client-1',
        totalSessions: 10,
        purchasedAgorot: 150_000,
        remaining: 10,
      });
    });
  });

  describe('the usage query', () => {
    it('counts only package-backed, live, non-cancelled sessions', async () => {
      const h = makeHarness();
      await h.service.list(OWNER);

      expect(h.sessionGroupBy.mock.calls[0][0]).toEqual({
        by: ['packageId'],
        where: {
          packageId: { not: null },
          deletedAt: null,
          status: { not: 'cancelled' },
        },
        _count: { _all: true },
      });
    });
  });
});

describe('PackagesService.create', () => {
  const valid = {
    clientId: 'client-1',
    totalSessions: 10,
    purchasedAgorot: 150_000,
  };

  function dataSentToCreate(
    h: ReturnType<typeof makeHarness>,
  ): Record<string, unknown> {
    return h.packageCreate.mock.calls[0][0].data;
  }

  describe('session count validation', () => {
    it.each([
      [0, 'zero'],
      [-1, 'negative'],
      [-10, 'a negative bundle'],
      [0.9, 'rounds down to zero'],
      [1001, 'just above the 1000 ceiling'],
      [Number.NaN, 'NaN'],
      ['abc', 'a non-numeric string'],
      [{}, 'an object'],
      [null, 'null'],
      [undefined, 'missing'],
      [Number.POSITIVE_INFINITY, 'Infinity'],
      [Number.MAX_SAFE_INTEGER, 'absurd'],
    ])(
      'rejects a totalSessions of %j (%s) before opening a transaction',
      async (totalSessions) => {
        const h = makeHarness();
        await expect(
          h.service.create(OWNER, {
            ...valid,
            totalSessions: totalSessions as never,
          }),
        ).rejects.toThrow(BadRequestException);
        expect(h.withCoach).not.toHaveBeenCalled();
      },
    );

    it('accepts a single-session package', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, totalSessions: 1 });
      expect(dataSentToCreate(h).totalSessions).toBe(1);
    });

    it('accepts exactly 1000 sessions', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, totalSessions: 1000 });
      expect(dataSentToCreate(h).totalSessions).toBe(1000);
    });

    it('truncates a fractional count instead of storing it', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, totalSessions: 10.9 });
      expect(dataSentToCreate(h).totalSessions).toBe(10);
    });
  });

  describe('price validation', () => {
    it.each([
      [-1, 'negative'],
      [-150_000, 'a negative purchase'],
      [Number.NaN, 'NaN'],
      ['abc', 'a non-numeric string'],
      [{}, 'an object'],
      [undefined, 'missing'],
      [PG_INT4_MAX + 1, 'just past the int4 ceiling'],
      [99_999_999_00, 'above the int4 ceiling'],
      [Number.POSITIVE_INFINITY, 'Infinity'],
      [Number.MAX_SAFE_INTEGER, 'absurd'],
    ])(
      'rejects a purchasedAgorot of %j (%s) before opening a transaction',
      async (purchased) => {
        const h = makeHarness();
        await expect(
          h.service.create(OWNER, {
            ...valid,
            purchasedAgorot: purchased as never,
          }),
        ).rejects.toThrow(BadRequestException);
        expect(h.withCoach).not.toHaveBeenCalled();
      },
    );

    it('allows a zero-price package, e.g. a comped bundle', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, purchasedAgorot: 0 });
      expect(dataSentToCreate(h).purchasedAgorot).toBe(0);
    });

    // Number(null) is 0, unlike Number(undefined) which is NaN — so an
    // explicit null slips through as a free package while omitting the field
    // is a 400.
    it('treats an explicit null price as zero', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        ...valid,
        purchasedAgorot: null as never,
      });
      expect(dataSentToCreate(h).purchasedAgorot).toBe(0);
    });

    it('accepts exactly the int4 ceiling', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, purchasedAgorot: PG_INT4_MAX });
      expect(dataSentToCreate(h).purchasedAgorot).toBe(PG_INT4_MAX);
    });

    it('truncates fractional agorot', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, purchasedAgorot: 150_000.99 });
      expect(dataSentToCreate(h).purchasedAgorot).toBe(150_000);
    });
  });

  describe('client validation and scoping', () => {
    it.each(['', undefined, null])(
      'rejects a %j clientId',
      async (clientId) => {
        const h = makeHarness();
        await expect(
          h.service.create(OWNER, { ...valid, clientId: clientId as never }),
        ).rejects.toThrow(BadRequestException);
        expect(h.withCoach).not.toHaveBeenCalled();
      },
    );

    it('rejects a null body without a TypeError', async () => {
      const h = makeHarness();
      await expect(h.service.create(OWNER, null as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('runs inside an RLS-scoped transaction for the calling coach', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, valid);
      expect(h.withCoach).toHaveBeenCalledWith(OWNER, expect.any(Function));
    });

    it('throws 404 for an unknown client', async () => {
      const h = makeHarness();
      await expect(
        h.service.create(OWNER, { ...valid, clientId: 'nope' }),
      ).rejects.toThrow(NotFoundException);
      expect(h.packageCreate).not.toHaveBeenCalled();
    });

    it('throws 404 for a soft-deleted client', async () => {
      const h = makeHarness({
        clients: [
          clientRow({ deletedAt: new Date('2026-02-01T00:00:00.000Z') }),
        ],
      });

      await expect(h.service.create(OWNER, valid)).rejects.toThrow(
        NotFoundException,
      );
      expect(h.packageCreate).not.toHaveBeenCalled();
    });

    it('throws 404 — sells nothing — when the client belongs to another coach', async () => {
      const h = makeHarness({ clients: [clientRow({ coachId: OTHER })] });

      await expect(h.service.create(OWNER, valid)).rejects.toThrow(
        NotFoundException,
      );
      expect(h.packageCreate).not.toHaveBeenCalled();
    });

    it('stamps the coachId from the session and the clientId from the verified row', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { ...valid, coachId: OTHER } as never);

      expect(dataSentToCreate(h)).toMatchObject({
        coachId: OWNER,
        clientId: 'client-1',
      });
    });

    it('writes only the package columns it owns', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        ...valid,
        id: 'chosen',
        deletedAt: null,
      } as never);

      expect(Object.keys(dataSentToCreate(h)).sort()).toEqual([
        'clientId',
        'coachId',
        'purchasedAgorot',
        'totalSessions',
      ]);
    });
  });

  it('reports a brand new package as fully remaining', async () => {
    const h = makeHarness();

    await expect(
      h.service.create(OWNER, { ...valid, totalSessions: 8 }),
    ).resolves.toMatchObject({
      totalSessions: 8,
      remaining: 8,
    });
  });
});

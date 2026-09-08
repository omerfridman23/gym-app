import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { ClientsService } from './clients.service.js';

const PG_INT4_MAX = 2_147_483_647;
const OWNER = 'coach-1';
const OTHER = 'coach-2';

function clientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'client-1',
    coachId: OWNER,
    name: 'דני לוי',
    phone: '+972501234567',
    fields: {},
    priceAgorot: 18_000,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null as Date | null,
    ...overrides,
  };
}

type Row = ReturnType<typeof clientRow>;
type Where = { id?: string; deletedAt?: Date | null };

/**
 * The real isolation comes from postgres RLS, which a unit test cannot run.
 * This harness stands in for it: the fake `tx` only ever sees rows whose
 * coachId matches the coach that `withCoach` was called with, so passing a
 * foreign id behaves the way the database would.
 */
function makeHarness(rows: Row[] = [clientRow()]) {
  let scopedCoachId = '';

  const visible = (where: Where | undefined) =>
    rows.filter(
      (row) =>
        row.coachId === scopedCoachId &&
        (where?.id === undefined || row.id === where.id) &&
        (where?.deletedAt !== null || row.deletedAt === null),
    );

  const findMany = vi.fn(async ({ where }: { where?: Where }) =>
    visible(where),
  );
  const findFirst = vi.fn(
    async ({ where }: { where?: Where }) => visible(where)[0] ?? null,
  );
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
    clientRow(data),
  );
  const update = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => clientRow({ ...data, id: where.id }),
  );

  const tx = { client: { findMany, findFirst, create, update } };
  const withCoach = vi.fn((coachId: string, fn: (t: typeof tx) => unknown) => {
    scopedCoachId = coachId;
    return fn(tx);
  });

  return {
    withCoach,
    findMany,
    findFirst,
    create,
    update,
    service: new ClientsService({ withCoach } as unknown as PrismaService),
  };
}

describe('ClientsService.list', () => {
  it('runs inside an RLS-scoped transaction for the calling coach', async () => {
    const h = makeHarness();
    await h.service.list(OWNER);
    expect(h.withCoach).toHaveBeenCalledWith(OWNER, expect.any(Function));
  });

  it('asks the database to exclude soft-deleted clients', async () => {
    const h = makeHarness();
    await h.service.list(OWNER);
    expect(h.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null });
  });

  it('leaves soft-deleted clients out of the result', async () => {
    const h = makeHarness([
      clientRow({ id: 'live' }),
      clientRow({
        id: 'gone',
        deletedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    ]);

    const result = await h.service.list(OWNER);

    expect(result.map((c) => c.id)).toEqual(['live']);
  });

  it('sorts by name so the list is stable for RTL display', async () => {
    const h = makeHarness();
    await h.service.list(OWNER);
    expect(h.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: { name: 'asc' },
    });
  });

  it('never returns another coach clients', async () => {
    const h = makeHarness([
      clientRow({ id: 'mine' }),
      clientRow({ id: 'theirs', coachId: OTHER }),
    ]);

    await expect(h.service.list(OWNER)).resolves.toMatchObject([
      { id: 'mine' },
    ]);
    await expect(h.service.list(OTHER)).resolves.toMatchObject([
      { id: 'theirs' },
    ]);
  });
});

describe('ClientsService.create', () => {
  function dataSentToCreate(
    h: ReturnType<typeof makeHarness>,
  ): Record<string, unknown> {
    return h.create.mock.calls[0][0].data;
  }

  describe('required fields', () => {
    it.each([
      [{ name: '', phone: '0501234567' }, 'empty name'],
      [{ name: '   ', phone: '0501234567' }, 'blank name'],
      [{ name: 'דני', phone: '' }, 'empty phone'],
      [{ name: 'דני', phone: '  ' }, 'blank phone'],
      [{ phone: '0501234567' }, 'missing name'],
      [{ name: 'דני' }, 'missing phone'],
      [{}, 'empty body'],
    ])('rejects %j (%s) before opening a transaction', async (input) => {
      const h = makeHarness();
      await expect(h.service.create(OWNER, input as never)).rejects.toThrow(
        BadRequestException,
      );
      expect(h.withCoach).not.toHaveBeenCalled();
    });

    it('rejects a null body without a TypeError', async () => {
      const h = makeHarness();
      await expect(h.service.create(OWNER, null as never)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('scoping', () => {
    it('runs inside an RLS-scoped transaction for the calling coach', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { name: 'דני', phone: '0501234567' });
      expect(h.withCoach).toHaveBeenCalledWith(OWNER, expect.any(Function));
    });

    it('stamps the coachId from the session, not from the request body', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        name: 'דני',
        phone: '0501234567',
        coachId: OTHER,
      } as never);

      expect(dataSentToCreate(h).coachId).toBe(OWNER);
    });
  });

  describe('normalization', () => {
    it('trims the name and the phone', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        name: '  דני לוי  ',
        phone: '  0501234567  ',
      });

      expect(dataSentToCreate(h)).toMatchObject({
        name: 'דני לוי',
        phone: '0501234567',
      });
    });

    it('bounds the name length', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        name: 'א'.repeat(10_000),
        phone: '0501234567',
      });

      expect((dataSentToCreate(h).name as string).length).toBe(200);
    });

    it('bounds the phone length', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { name: 'דני', phone: '0'.repeat(500) });

      expect((dataSentToCreate(h).phone as string).length).toBe(30);
    });

    it('defaults a missing price to zero', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { name: 'דני', phone: '0501234567' });

      expect(dataSentToCreate(h).priceAgorot).toBe(0);
    });

    it('floors a negative price to zero', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        name: 'דני',
        phone: '0501234567',
        priceAgorot: -1,
      });

      expect(dataSentToCreate(h).priceAgorot).toBe(0);
    });

    it('truncates a fractional price to whole agorot', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        name: 'דני',
        phone: '0501234567',
        priceAgorot: 18_000.99,
      });

      expect(dataSentToCreate(h).priceAgorot).toBe(18_000);
    });

    it('clamps a price above the postgres int4 ceiling', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        name: 'דני',
        phone: '0501234567',
        priceAgorot: 99_999_999_00,
      });

      expect(dataSentToCreate(h).priceAgorot).toBe(PG_INT4_MAX);
    });

    it.each([
      ['abc', 'a non-numeric string'],
      [{}, 'an object'],
      [[1, 2], 'an array'],
      [Number.NaN, 'NaN itself'],
      [undefined, 'undefined'],
    ])(
      'stores 0 rather than NaN when the price is %j (%s)',
      async (priceAgorot) => {
        const h = makeHarness();
        await h.service.create(OWNER, {
          name: 'דני',
          phone: '0501234567',
          priceAgorot: priceAgorot as never,
        });

        expect(dataSentToCreate(h).priceAgorot).toBe(0);
      },
    );

    it('coerces Infinity to the int4 ceiling instead of failing at the driver', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        name: 'דני',
        phone: '0501234567',
        priceAgorot: Number.POSITIVE_INFINITY,
      });

      expect(dataSentToCreate(h).priceAgorot).toBe(PG_INT4_MAX);
    });
  });

  // `fields` is schemaless JSONB and CreateClientInput is a bare interface with
  // no ValidationPipe behind it, so anything JSON-shaped can arrive here.
  describe('schemaless fields sanitization', () => {
    function fieldsSentToCreate(
      h: ReturnType<typeof makeHarness>,
    ): Record<string, string> {
      return dataSentToCreate(h).fields as Record<string, string>;
    }

    it('keeps well-formed string entries', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        name: 'דני',
        phone: '0501234567',
        fields: { level: 'מתחיל', side: 'ימין' },
      });

      expect(fieldsSentToCreate(h)).toEqual({ level: 'מתחיל', side: 'ימין' });
    });

    it('trims keys and values', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        name: 'דני',
        phone: '0501234567',
        fields: { '  level  ': '  מתחיל  ' },
      });

      expect(fieldsSentToCreate(h)).toEqual({ level: 'מתחיל' });
    });

    it('caps the number of entries at 20', async () => {
      const h = makeHarness();
      const fields = Object.fromEntries(
        Array.from({ length: 200 }, (_, i) => [`k${i}`, String(i)]),
      );

      await h.service.create(OWNER, {
        name: 'דני',
        phone: '0501234567',
        fields,
      });

      expect(Object.keys(fieldsSentToCreate(h)).length).toBe(20);
    });

    it('bounds key and value length', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        name: 'דני',
        phone: '0501234567',
        fields: { ['k'.repeat(500)]: 'v'.repeat(5_000) },
      });

      const [[key, value]] = Object.entries(fieldsSentToCreate(h));
      expect(key.length).toBe(50);
      expect(value.length).toBe(500);
    });

    it.each([
      ['a string', 'not-an-object'],
      ['a number', 42],
      ['null', null],
      ['undefined', undefined],
      ['a boolean', true],
    ])(
      'falls back to an empty object when fields is %s',
      async (_label, fields) => {
        const h = makeHarness();
        await h.service.create(OWNER, {
          name: 'דני',
          phone: '0501234567',
          fields: fields as never,
        });

        expect(fieldsSentToCreate(h)).toEqual({});
      },
    );

    it('flattens nested values to strings rather than storing raw JSON', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        name: 'דני',
        phone: '0501234567',
        fields: { nested: { a: 1 }, list: [1, 2], nothing: null } as never,
      });

      const stored = fieldsSentToCreate(h);
      expect(Object.values(stored).every((v) => typeof v === 'string')).toBe(
        true,
      );
      expect(stored.nothing).toBe('');
    });
  });

  describe('hostile input on an unvalidated body', () => {
    it.each([
      ['a number', 12_345],
      ['an object', { toString: () => 'x' }],
      ['an array', ['דני']],
      ['a boolean', true],
    ])('does not crash when the name is %s', async (_label, name) => {
      const h = makeHarness();
      await expect(
        h.service.create(OWNER, { name: name as never, phone: '0501234567' }),
      ).resolves.toBeDefined();
    });

    it('stringifies a numeric phone instead of handing prisma a number', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, { name: 'דני', phone: 501234567 as never });

      expect(dataSentToCreate(h).phone).toBe('501234567');
    });

    it('ignores unknown keys rather than forwarding them to prisma', async () => {
      const h = makeHarness();
      await h.service.create(OWNER, {
        name: 'דני',
        phone: '0501234567',
        id: 'attacker-chosen-id',
        deletedAt: null,
      } as never);

      expect(Object.keys(dataSentToCreate(h)).sort()).toEqual([
        'coachId',
        'fields',
        'name',
        'normalizedPhone',
        'phone',
        'priceAgorot',
      ]);
    });
  });
});

describe('ClientsService.update', () => {
  function dataSentToUpdate(
    h: ReturnType<typeof makeHarness>,
  ): Record<string, unknown> {
    return h.update.mock.calls[0][0].data;
  }

  describe('scoping and existence', () => {
    it('runs inside an RLS-scoped transaction for the calling coach', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'client-1', { name: 'דני' });
      expect(h.withCoach).toHaveBeenCalledWith(OWNER, expect.any(Function));
    });

    it('checks existence before updating', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'client-1', { name: 'דני' });

      expect(h.findFirst.mock.calls[0][0].where).toEqual({
        id: 'client-1',
        deletedAt: null,
      });
      expect(h.update.mock.calls[0][0].where).toEqual({ id: 'client-1' });
    });

    it('throws 404 for an unknown client', async () => {
      const h = makeHarness();
      await expect(
        h.service.update(OWNER, 'nope', { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(h.update).not.toHaveBeenCalled();
    });

    it('throws 404 for a soft-deleted client', async () => {
      const h = makeHarness([
        clientRow({ deletedAt: new Date('2026-02-01T00:00:00.000Z') }),
      ]);

      await expect(
        h.service.update(OWNER, 'client-1', { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(h.update).not.toHaveBeenCalled();
    });

    it('throws 404 — never touches the row — when another coach owns the client', async () => {
      const h = makeHarness([clientRow({ coachId: OTHER })]);

      await expect(
        h.service.update(OWNER, 'client-1', { name: 'פרוץ' }),
      ).rejects.toThrow(NotFoundException);
      expect(h.update).not.toHaveBeenCalled();
    });

    it('does not leak the foreign row in the error', async () => {
      const h = makeHarness([clientRow({ coachId: OTHER, name: 'סוד' })]);

      const error = await h.service
        .update(OWNER, 'client-1', { name: 'x' })
        .catch((e: unknown) => e);

      expect((error as Error).message).not.toContain('סוד');
    });
  });

  describe('partial updates', () => {
    it('sends only the supplied fields', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'client-1', { name: 'דני' });
      expect(Object.keys(dataSentToUpdate(h))).toEqual(['name']);
    });

    it('sends nothing for an empty patch', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'client-1', {});
      expect(dataSentToUpdate(h)).toEqual({});
    });

    it('allows setting the price to zero', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'client-1', { priceAgorot: 0 });
      expect(dataSentToUpdate(h)).toEqual({ priceAgorot: 0 });
    });

    it('allows clearing the schemaless fields', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'client-1', { fields: {} });
      expect(dataSentToUpdate(h)).toEqual({ fields: {} });
    });
  });

  describe('normalization', () => {
    it('trims the name and the phone', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'client-1', {
        name: '  דני  ',
        phone: '  0501234567  ',
      });

      expect(dataSentToUpdate(h)).toEqual({
        name: 'דני',
        phone: '0501234567',
        normalizedPhone: '+972501234567',
      });
    });

    it('bounds the name and phone length', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'client-1', {
        name: 'א'.repeat(10_000),
        phone: '0'.repeat(500),
      });

      expect((dataSentToUpdate(h).name as string).length).toBe(200);
      expect((dataSentToUpdate(h).phone as string).length).toBe(30);
    });

    it('floors a negative price to zero', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'client-1', { priceAgorot: -500 });
      expect(dataSentToUpdate(h).priceAgorot).toBe(0);
    });

    it('clamps a price above the postgres int4 ceiling', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'client-1', {
        priceAgorot: Number.MAX_SAFE_INTEGER,
      });
      expect(dataSentToUpdate(h).priceAgorot).toBe(PG_INT4_MAX);
    });

    it('does not persist NaN for a non-numeric price', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'client-1', {
        priceAgorot: 'abc' as never,
      });
      expect(dataSentToUpdate(h).priceAgorot).toBe(0);
    });

    it('does not crash on a non-string name', async () => {
      const h = makeHarness();
      await expect(
        h.service.update(OWNER, 'client-1', { name: 12_345 as never }),
      ).resolves.toBeDefined();
    });

    it('turns a null name into an empty string rather than a null column', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'client-1', { name: null as never });
      expect(dataSentToUpdate(h).name).toBe('');
    });

    it('ignores unknown keys rather than forwarding them to prisma', async () => {
      const h = makeHarness();
      await h.service.update(OWNER, 'client-1', {
        name: 'דני',
        coachId: OTHER,
        deletedAt: null,
      } as never);

      expect(Object.keys(dataSentToUpdate(h))).toEqual(['name']);
    });
  });
});

describe('ClientsService.softDelete', () => {
  it('runs inside an RLS-scoped transaction for the calling coach', async () => {
    const h = makeHarness();
    await h.service.softDelete(OWNER, 'client-1');
    expect(h.withCoach).toHaveBeenCalledWith(OWNER, expect.any(Function));
  });

  it('stamps deletedAt instead of issuing a DELETE', async () => {
    const h = makeHarness();
    await h.service.softDelete(OWNER, 'client-1');

    const { where, data } = h.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'client-1' });
    expect(Object.keys(data)).toEqual(['deletedAt']);
    expect(data.deletedAt).toBeInstanceOf(Date);
  });

  it('resolves without a value', async () => {
    const h = makeHarness();
    await expect(
      h.service.softDelete(OWNER, 'client-1'),
    ).resolves.toBeUndefined();
  });

  it('throws 404 for an unknown client', async () => {
    const h = makeHarness();
    await expect(h.service.softDelete(OWNER, 'nope')).rejects.toThrow(
      NotFoundException,
    );
    expect(h.update).not.toHaveBeenCalled();
  });

  it('throws 404 when deleting twice, so deletedAt is never overwritten', async () => {
    const firstDeletion = new Date('2026-02-01T00:00:00.000Z');
    const h = makeHarness([clientRow({ deletedAt: firstDeletion })]);

    await expect(h.service.softDelete(OWNER, 'client-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(h.update).not.toHaveBeenCalled();
  });

  it('throws 404 — never deletes — when another coach owns the client', async () => {
    const h = makeHarness([clientRow({ coachId: OTHER })]);

    await expect(h.service.softDelete(OWNER, 'client-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(h.update).not.toHaveBeenCalled();
  });
});

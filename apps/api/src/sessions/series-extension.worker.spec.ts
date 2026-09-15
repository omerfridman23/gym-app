import { describe, expect, it, vi } from 'vitest';
import type { PrismaAdminService } from '../database/prisma-admin.service.js';
import { SeriesExtensionWorker } from './series-extension.worker.js';

describe('SeriesExtensionWorker', () => {
  it('extends an active series until the twelve-week horizon', async () => {
    const created: Record<string, unknown>[] = [];
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      sessionSeries: {
        findFirst: vi.fn(async () => ({
          id: 'series-1',
          coachId: 'coach-1',
          clientId: 'client-1',
          typeId: 'private',
          timeLocal: '18:00',
          durationMin: 60,
          location: 'סטודיו',
          priceAgorot: 12000,
          startsOn: new Date('2026-09-09T00:00:00Z'),
          endsOn: null,
          deletedAt: null,
        })),
      },
      session: {
        findFirst: vi.fn(async () => ({
          startsAt: new Date('2026-11-18T16:00:00Z'),
        })),
        findMany: vi.fn(async () => []),
        groupBy: vi.fn(async () => []),
        create: vi.fn(async ({ data }) => {
          created.push(data);
          return data;
        }),
      },
      package: { findMany: vi.fn(async () => []) },
    };
    const db = {
      sessionSeries: {
        findMany: vi.fn(async () => [{ id: 'series-1' }]),
      },
      $transaction: vi.fn(async (fn) => fn(tx)),
    };
    const worker = new SeriesExtensionWorker(
      db as unknown as PrismaAdminService,
    );

    await expect(
      worker.run(new Date('2026-09-09T05:00:00Z')),
    ).resolves.toBe(2);
    expect(created.map((row) => row.startsAt)).toEqual([
      new Date('2026-11-25T16:00:00.000Z'),
      new Date('2026-12-02T16:00:00.000Z'),
    ]);
  });

  it('does not create a duplicate when the next occurrence is occupied', async () => {
    const create = vi.fn();
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      sessionSeries: {
        findFirst: vi.fn(async () => ({
          id: 'series-1',
          coachId: 'coach-1',
          clientId: 'client-1',
          typeId: 'private',
          timeLocal: '18:00',
          durationMin: 60,
          location: null,
          priceAgorot: 12000,
          startsOn: new Date('2026-09-09T00:00:00Z'),
          endsOn: null,
          deletedAt: null,
        })),
      },
      session: {
        findFirst: vi.fn(async () => ({
          startsAt: new Date('2026-11-25T16:00:00Z'),
        })),
        findMany: vi.fn(async () => [
          {
            startsAt: new Date('2026-12-02T16:00:00Z'),
            durationMin: 60,
          },
        ]),
        groupBy: vi.fn(async () => []),
        create,
      },
      package: { findMany: vi.fn(async () => []) },
    };
    const db = {
      sessionSeries: {
        findMany: vi.fn(async () => [{ id: 'series-1' }]),
      },
      $transaction: vi.fn(async (fn) => fn(tx)),
    };
    const worker = new SeriesExtensionWorker(
      db as unknown as PrismaAdminService,
    );

    await expect(
      worker.run(new Date('2026-09-09T05:00:00Z')),
    ).resolves.toBe(0);
    expect(create).not.toHaveBeenCalled();
  });
});

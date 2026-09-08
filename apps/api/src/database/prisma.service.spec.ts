import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from './prisma.service.js';

describe('PrismaService.withCoach', () => {
  it('sets the coach context before running the callback', async () => {
    const order: string[] = [];
    const executeRaw = vi.fn(async () => {
      order.push('set-context');
      return 1;
    });
    const tx = { $executeRaw: executeRaw };
    const transaction = vi.fn(async (fn: (value: typeof tx) => unknown) =>
      fn(tx),
    );
    const fake = { $transaction: transaction };

    const result = await PrismaService.prototype.withCoach.call(
      fake,
      'coach-1',
      async (scopedTx: typeof tx) => {
        order.push('callback');
        expect(scopedTx).toBe(tx);
        return 'ok';
      },
    );

    expect(result).toBe('ok');
    expect(order).toEqual(['set-context', 'callback']);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('passes coachId as a bound template value, not interpolated SQL text', async () => {
    let strings: TemplateStringsArray | undefined;
    let values: unknown[] = [];
    const tx = {
      $executeRaw: vi.fn((raw: TemplateStringsArray, ...params: unknown[]) => {
        strings = raw;
        values = params;
        return Promise.resolve(1);
      }),
    };
    const fake = {
      $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
    };

    await PrismaService.prototype.withCoach.call(
      fake,
      "x'); DROP TABLE coaches; --",
      async () => undefined,
    );

    expect(strings?.join('?')).toBe(
      "SELECT set_config('app.coach_id', ?, true)",
    );
    expect(values).toEqual(["x'); DROP TABLE coaches; --"]);
  });

  it('never runs the callback when setting the RLS context fails', async () => {
    const tx = {
      $executeRaw: vi.fn().mockRejectedValue(new Error('set_config failed')),
    };
    const fake = {
      $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
    };
    const callback = vi.fn();

    await expect(
      PrismaService.prototype.withCoach.call(fake, 'coach-1', callback),
    ).rejects.toThrow('set_config failed');
    expect(callback).not.toHaveBeenCalled();
  });

  it('propagates callback failures so the transaction can roll back', async () => {
    const tx = { $executeRaw: vi.fn().mockResolvedValue(1) };
    const fake = {
      $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
    };

    await expect(
      PrismaService.prototype.withCoach.call(fake, 'coach-1', async () => {
        throw new Error('write failed');
      }),
    ).rejects.toThrow('write failed');
  });
});

describe('PrismaService.onModuleDestroy', () => {
  it('disconnects prisma', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    await expect(
      PrismaService.prototype.onModuleDestroy.call({ $disconnect: disconnect }),
    ).resolves.toBeUndefined();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

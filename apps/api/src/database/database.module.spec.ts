import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import type { Pool, PoolConfig } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PG_POOL } from './database.constants.js';
import { DatabaseModule } from './database.module.js';

type PoolProvider = {
  provide: string;
  inject: unknown[];
  useFactory: (config: ConfigService) => Pool;
};

function poolProvider(): PoolProvider {
  const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DatabaseModule) as unknown[];
  const provider = providers.find(
    (item): item is PoolProvider =>
      typeof item === 'object' && item !== null && 'provide' in item && item.provide === PG_POOL,
  );
  if (!provider) throw new Error('PG_POOL provider is missing');
  return provider;
}

function config(values: Record<string, string | undefined>) {
  return {
    getOrThrow: vi.fn((key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`${key} missing`);
      return value;
    }),
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const pools: Pool[] = [];

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

describe('DatabaseModule pool configuration', () => {
  it('declares the shared pool as an exported provider', () => {
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, DatabaseModule) as unknown[];
    expect(poolProvider().inject).toEqual([ConfigService]);
    expect(exports).toContain(PG_POOL);
  });

  it.each([
    'postgresql://user:pass@localhost:5432/gym',
    'postgresql://user:pass@127.0.0.1:5432/gym',
  ])('disables TLS for local database URL %s', (connectionString) => {
    const pool = poolProvider().useFactory(config({ DATABASE_URL: connectionString }));
    pools.push(pool);
    expect((pool.options as PoolConfig).ssl).toBe(false);
  });

  it('requires certificate verification for a remote database', () => {
    const pool = poolProvider().useFactory(
      config({ DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/gym' }),
    );
    pools.push(pool);
    expect((pool.options as PoolConfig).ssl).toEqual({ rejectUnauthorized: true });
  });

  it('uses the safe connection and idle timeouts and default pool limit', () => {
    const pool = poolProvider().useFactory(
      config({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/gym' }),
    );
    pools.push(pool);
    expect(pool.options).toMatchObject({
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  });

  it('honors an explicit pool size', () => {
    const pool = poolProvider().useFactory(
      config({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/gym',
        DATABASE_POOL_MAX: '23',
      }),
    );
    pools.push(pool);
    expect(pool.options.max).toBe(23);
  });

  it('fails immediately when DATABASE_URL is absent', () => {
    expect(() => poolProvider().useFactory(config({}))).toThrow('DATABASE_URL missing');
  });

  it('closes the shared pool during application shutdown', async () => {
    const pool = { end: vi.fn().mockResolvedValue(undefined) } as unknown as Pool;
    const module = new DatabaseModule(pool);

    await module.onApplicationShutdown();

    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});

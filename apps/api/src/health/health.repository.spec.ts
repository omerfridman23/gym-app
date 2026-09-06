import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthRepository } from './health.repository.js';

describe('HealthRepository', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the minimal SELECT 1 probe', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const repo = new HealthRepository({ query } as never);

    await expect(repo.probe()).resolves.toEqual({ reachable: true, latencyMs: 0 });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('measures successful probe latency', async () => {
    const query = vi.fn().mockImplementation(async () => {
      vi.setSystemTime(new Date('2026-09-06T12:00:00.037Z'));
    });
    const repo = new HealthRepository({ query } as never);

    await expect(repo.probe()).resolves.toEqual({ reachable: true, latencyMs: 37 });
  });

  it('returns an unreachable report instead of throwing an Error', async () => {
    const query = vi.fn().mockRejectedValue(new Error('connection refused'));
    const repo = new HealthRepository({ query } as never);

    await expect(repo.probe()).resolves.toEqual({
      reachable: false,
      latencyMs: 0,
      error: 'connection refused',
    });
  });

  it('handles hostile non-Error rejections without crashing', async () => {
    const query = vi.fn().mockRejectedValue({ password: 'secret' });
    const repo = new HealthRepository({ query } as never);

    await expect(repo.probe()).resolves.toEqual({
      reachable: false,
      latencyMs: 0,
      error: 'unknown database error',
    });
  });

  it('measures failed probe latency too', async () => {
    const query = vi.fn().mockImplementation(async () => {
      vi.setSystemTime(new Date('2026-09-06T12:00:05.000Z'));
      throw new Error('timeout');
    });
    const repo = new HealthRepository({ query } as never);

    await expect(repo.probe()).resolves.toMatchObject({
      reachable: false,
      latencyMs: 5_000,
      error: 'timeout',
    });
  });
});

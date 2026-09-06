import { describe, expect, it, vi } from 'vitest';
import type { HealthRepository } from './health.repository.js';
import { HealthService } from './health.service.js';

function serviceWithProbe(probe: { reachable: boolean; latencyMs: number; error?: string }) {
  const repo = { probe: vi.fn().mockResolvedValue(probe) };
  return { service: new HealthService(repo as unknown as HealthRepository), repo };
}

describe('HealthService', () => {
  it('reports ok when the database is reachable', async () => {
    const { service } = serviceWithProbe({ reachable: true, latencyMs: 12 });

    const report = await service.getReport();

    expect(report.status).toBe('ok');
    expect(report.service).toBe('gym-app-api');
    expect(report.database).toEqual({ reachable: true, latencyMs: 12 });
  });

  it('reports degraded when the database is unreachable', async () => {
    const { service } = serviceWithProbe({ reachable: false, latencyMs: 5000, error: 'ETIMEDOUT' });

    const report = await service.getReport();

    expect(report.status).toBe('degraded');
    expect(report.database.reachable).toBe(false);
  });

  it('returns an ISO-8601 timestamp', async () => {
    const { service } = serviceWithProbe({ reachable: true, latencyMs: 1 });

    const report = await service.getReport();

    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(report.timestamp))).toBe(false);
  });

  it('does not ship a developer scratch note in the public payload', async () => {
    const { service } = serviceWithProbe({ reachable: true, latencyMs: 1 });

    const report = await service.getReport();

    // /api/health is unauthenticated and internet-facing; `message` must be a
    // stable operational string, not a leftover note to self.
    expect(report.message).not.toMatch(/lets make plan/i);
  });

  it('does not leak the raw database error string to unauthenticated callers', async () => {
    const { service } = serviceWithProbe({
      reachable: false,
      latencyMs: 20,
      error: 'password authentication failed for user "app_user" on host ep-xyz.eu-central-1.aws.neon.tech',
    });

    const report = await service.getReport();

    expect(JSON.stringify(report)).not.toMatch(/password authentication failed/);
  });
});

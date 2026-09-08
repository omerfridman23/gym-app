import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller.js';
import type { HealthService } from './health.service.js';

describe('HealthController', () => {
  it('returns the service report unchanged', async () => {
    const report = {
      status: 'ok' as const,
      service: 'coachos-api',
      message: 'service is healthy',
      timestamp: '2026-09-06T12:00:00.000Z',
      database: { reachable: true, latencyMs: 3 },
    };
    const getReport = vi.fn().mockResolvedValue(report);
    const controller = new HealthController({
      getReport,
    } as unknown as HealthService);

    await expect(controller.getHealth()).resolves.toBe(report);
    expect(getReport).toHaveBeenCalledTimes(1);
  });

  it('does not swallow a service failure', async () => {
    const getReport = vi.fn().mockRejectedValue(new Error('unexpected'));
    const controller = new HealthController({
      getReport,
    } as unknown as HealthService);
    await expect(controller.getHealth()).rejects.toThrow('unexpected');
  });
});

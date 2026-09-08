import { Injectable } from '@nestjs/common';
import { type DatabaseProbe, HealthRepository } from './health.repository.js';

export interface HealthReport {
  status: 'ok' | 'degraded';
  service: string;
  message: string;
  timestamp: string;
  // The raw probe error stays out of the public payload (it can contain
  // connection details); HealthRepository already logs it server-side.
  database: Omit<DatabaseProbe, 'error'>;
}

@Injectable()
export class HealthService {
  constructor(private readonly healthRepository: HealthRepository) {}

  async getReport(): Promise<HealthReport> {
    const { reachable, latencyMs } = await this.healthRepository.probe();

    return {
      status: reachable ? 'ok' : 'degraded',
      service: 'coachos-api',
      message: reachable ? 'service is healthy' : 'database is unreachable',
      timestamp: new Date().toISOString(),
      database: { reachable, latencyMs },
    };
  }
}

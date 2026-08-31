import { Injectable } from '@nestjs/common';
import { type DatabaseProbe, HealthRepository } from './health.repository.js';

export interface HealthReport {
  status: 'ok' | 'degraded';
  service: string;
  message: string;
  timestamp: string;
  database: DatabaseProbe;
}

@Injectable()
export class HealthService {
  constructor(private readonly healthRepository: HealthRepository) {}

  async getReport(): Promise<HealthReport> {
    const database = await this.healthRepository.probe();

    return {
      status: database.reachable ? 'ok' : 'degraded',
      service: 'gym-app-api',
      message: 'here this came from api',
      timestamp: new Date().toISOString(),
      database,
    };
  }
}

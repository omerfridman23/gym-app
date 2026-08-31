import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.constants.js';

export interface DatabaseProbe {
  reachable: boolean;
  latencyMs: number;
  error?: string;
}

@Injectable()
export class HealthRepository {
  private readonly logger = new Logger(HealthRepository.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async probe(): Promise<DatabaseProbe> {
    const startedAt = Date.now();

    try {
      await this.pool.query('SELECT 1');
      return { reachable: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown database error';
      this.logger.error(`Database probe failed: ${message}`);

      return { reachable: false, latencyMs: Date.now() - startedAt, error: message };
    }
  }
}

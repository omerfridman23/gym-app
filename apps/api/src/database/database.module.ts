import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PG_POOL } from './database.constants.js';
import { PrismaAdminService } from './prisma-admin.service.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaAdminService,
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Pool => {
        const connectionString = config.getOrThrow<string>('DATABASE_URL');
        const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

        return new Pool({
          connectionString,
          max: Number(config.get<string>('DATABASE_POOL_MAX') ?? 10),
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000,
          ssl: isLocal ? false : { rejectUnauthorized: true },
        });
      },
    },
  ],
  exports: [PG_POOL, PrismaService, PrismaAdminService],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

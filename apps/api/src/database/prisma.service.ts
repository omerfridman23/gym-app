import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';

/**
 * RLS-scoped Prisma client. Connects as `app_user` (pooled DATABASE_URL),
 * which can only see rows for the coach set via `withCoach`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
        max: Number(config.get<string>('DATABASE_POOL_MAX') ?? 10),
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Runs `fn` inside a transaction with `app.coach_id` set, so every query in
   * it is row-level-security scoped to that coach. All repository access for
   * authenticated requests must go through this.
   */
  withCoach<T>(
    coachId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.coach_id', ${coachId}, true)`;
      return fn(tx);
    });
  }
}

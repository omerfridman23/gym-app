import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Privileged Prisma client (table owner, direct URL). Bypasses RLS.
 * ONLY for pre-auth flows and owner-only tables: OTP codes, settings,
 * and coach lookup/creation — nothing else.
 * Business data access must use PrismaService.withCoach instead.
 */
@Injectable()
export class PrismaAdminService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL_UNPOOLED'),
        max: 2,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

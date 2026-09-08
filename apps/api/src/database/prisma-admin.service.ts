import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function adminPoolMax(value: unknown): number {
  if (value === undefined || value === null || String(value).trim() === '')
    return 10;
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(Math.max(parsed, 1), 20);
}

/**
 * Privileged Prisma client (table owner, direct URL). Bypasses RLS.
 * ONLY for pre-auth flows and owner-only tables: OTP codes, settings,
 * and coach lookup/creation — nothing else.
 * Business data access must use PrismaService.withCoach instead.
 */
@Injectable()
export class PrismaAdminService
  extends PrismaClient
  implements OnModuleDestroy
{
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL_UNPOOLED'),
        // Public confirm/pay/booking traffic also uses this client. A pool of
        // two serialized modest concurrent traffic and pushed booking
        // availability beyond one-second p95 in production-mode testing.
        max: adminPoolMax(config.get<string>('DATABASE_ADMIN_POOL_MAX')),
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

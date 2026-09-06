import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Package } from '../generated/prisma/client.js';

export interface CreatePackageInput {
  clientId: string;
  totalSessions: number;
  purchasedAgorot: number;
}

export type PackageWithRemaining = Package & { remaining: number };

const PG_INT4_MAX = 2_147_483_647;

@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Packages with `remaining` = total minus sessions already taken from the package. */
  list(coachId: string): Promise<PackageWithRemaining[]> {
    return this.prisma.withCoach(coachId, async (tx) => {
      const packages = await tx.package.findMany({
        where: { deletedAt: null },
        orderBy: { purchasedAt: 'desc' },
      });
      const used = await tx.session.groupBy({
        by: ['packageId'],
        where: { packageId: { not: null }, deletedAt: null, status: { not: 'cancelled' } },
        _count: { _all: true },
      });
      const usedById = new Map(used.map((u) => [u.packageId, u._count._all]));
      return packages.map((p) => ({
        ...p,
        remaining: Math.max(0, p.totalSessions - (usedById.get(p.id) ?? 0)),
      }));
    });
  }

  // `async` so invalid input rejects instead of throwing synchronously out of
  // a Promise-returning method.
  async create(coachId: string, input: CreatePackageInput): Promise<PackageWithRemaining> {
    const total = Math.trunc(Number(input?.totalSessions));
    const purchased = Math.trunc(Number(input?.purchasedAgorot));
    if (!input?.clientId || Number.isNaN(total) || total <= 0 || total > 1000) {
      throw new BadRequestException('מספר אימונים לא תקין');
    }
    if (Number.isNaN(purchased) || purchased < 0 || purchased > PG_INT4_MAX) {
      throw new BadRequestException('סכום לא תקין');
    }

    return this.prisma.withCoach(coachId, async (tx) => {
      const client = await tx.client.findFirst({ where: { id: input.clientId, deletedAt: null } });
      if (!client) throw new NotFoundException('מתאמן לא נמצא');

      const created = await tx.package.create({
        data: {
          coachId,
          clientId: client.id,
          totalSessions: total,
          purchasedAgorot: purchased,
        },
      });
      return { ...created, remaining: total };
    });
  }
}

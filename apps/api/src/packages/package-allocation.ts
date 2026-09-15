import type { Prisma } from '../generated/prisma/client.js';

export async function lockClientPackages(
  tx: Prisma.TransactionClient,
  coachId: string,
  clientId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`${coachId}:packages:${clientId}`}::text, 0)
    )
  `;
}

/**
 * Reserves available package punches for sessions created in this transaction.
 * The caller must use the returned ids immediately while the transaction lock
 * is held. Packages are consumed oldest-first.
 */
export async function allocatePackageIds(
  tx: Prisma.TransactionClient,
  coachId: string,
  clientId: string,
  count: number,
): Promise<(string | null)[]> {
  await lockClientPackages(tx, coachId, clientId);
  const packages = await tx.package.findMany({
    where: { coachId, clientId, deletedAt: null },
    orderBy: { purchasedAt: 'asc' },
    select: { id: true, totalSessions: true },
  });
  if (packages.length === 0) return Array(count).fill(null);

  const used = await tx.session.groupBy({
    by: ['packageId'],
    where: {
      coachId,
      clientId,
      packageId: { in: packages.map((item) => item.id) },
      deletedAt: null,
      status: { not: 'cancelled' },
    },
    _count: { _all: true },
  });
  const usedByPackage = new Map(
    used.map((item) => [item.packageId, item._count._all]),
  );
  const available = packages.flatMap((item) =>
    Array(
      Math.max(0, item.totalSessions - (usedByPackage.get(item.id) ?? 0)),
    ).fill(item.id),
  );
  return Array.from({ length: count }, (_, index) => available[index] ?? null);
}

import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PrismaAdminService } from '../database/prisma-admin.service.js';
import { allocatePackageIds } from '../packages/package-allocation.js';
import {
  addDaysToIsoDate,
  israelWallClockToUtc,
} from './sessions.service.js';

const TWELVE_WEEKS_DAYS = 84;
const RUN_EVERY_MS = 6 * 60 * 60 * 1000;
const MS_PER_MIN = 60_000;

function israelDateIso(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

@Injectable()
export class SeriesExtensionWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SeriesExtensionWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly db: PrismaAdminService) {}

  onApplicationBootstrap(): void {
    void this.run();
    this.timer = setInterval(() => void this.run(), RUN_EVERY_MS);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const today = israelDateIso(now);
      const horizon = addDaysToIsoDate(today, TWELVE_WEEKS_DAYS);
      const series = await this.db.sessionSeries.findMany({
        where: {
          deletedAt: null,
          client: { deletedAt: null },
          startsOn: { lte: new Date(`${horizon}T00:00:00Z`) },
          OR: [
            { endsOn: null },
            { endsOn: { gte: new Date(`${today}T00:00:00Z`) } },
          ],
        },
        select: { id: true },
      });
      let created = 0;
      for (const item of series) {
        created += await this.extendOne(item.id, horizon);
      }
      if (created > 0) {
        this.logger.log(`Extended recurring series by ${created} sessions`);
      }
      return created;
    } catch (error) {
      this.logger.error(
        `Recurring-series extension failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    } finally {
      this.running = false;
    }
  }

  private extendOne(seriesId: string, horizon: string): Promise<number> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`series-extension:${seriesId}`}::text, 0)
        )
      `;
      const series = await tx.sessionSeries.findFirst({
        where: { id: seriesId, deletedAt: null },
      });
      if (!series) return 0;
      const last = await tx.session.findFirst({
        where: { seriesId },
        orderBy: { startsAt: 'desc' },
      });
      const lastDate = last
        ? israelDateIso(last.startsAt)
        : addDaysToIsoDate(series.startsOn.toISOString().slice(0, 10), -7);
      let nextDate = addDaysToIsoDate(lastDate, 7);
      let created = 0;

      while (
        nextDate <= horizon &&
        (!series.endsOn ||
          nextDate <= series.endsOn.toISOString().slice(0, 10))
      ) {
        const startsAt = israelWallClockToUtc(nextDate, series.timeLocal);
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`${series.coachId}:${nextDate}`}::text, 0)
          )
        `;
        const busy = await tx.session.findMany({
          where: {
            coachId: series.coachId,
            deletedAt: null,
            status: { in: ['pending', 'confirmed'] },
            startsAt: {
              gte: new Date(startsAt.getTime() - 24 * 60 * MS_PER_MIN),
              lt: new Date(
                startsAt.getTime() + series.durationMin * MS_PER_MIN,
              ),
            },
          },
          select: { startsAt: true, durationMin: true },
        });
        const end = startsAt.getTime() + series.durationMin * MS_PER_MIN;
        const blocked = busy.some(
          (session) =>
            session.startsAt.getTime() < end &&
            session.startsAt.getTime() +
              session.durationMin * MS_PER_MIN >
              startsAt.getTime(),
        );
        if (!blocked) {
          const [packageId] = await allocatePackageIds(
            tx,
            series.coachId,
            series.clientId,
            1,
          );
          await tx.session.create({
            data: {
              coachId: series.coachId,
              clientId: series.clientId,
              seriesId: series.id,
              typeId: series.typeId,
              startsAt,
              durationMin: series.durationMin,
              location: series.location,
              priceAgorot: packageId ? 0 : series.priceAgorot,
              courtCostAgorot: series.courtCostAgorot ?? 0,
              ...(packageId && { packageId }),
              status: 'pending',
            },
          });
          created += 1;
        }
        nextDate = addDaysToIsoDate(nextDate, 7);
      }
      return created;
    });
  }
}

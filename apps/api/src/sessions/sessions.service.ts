import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { SMS_PROVIDER, type SmsProvider } from '../auth/sms/sms-provider.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, Session } from '../generated/prisma/client.js';
import { allocatePackageIds } from '../packages/package-allocation.js';
import { toE164Israel } from '../reminders/reminders.template.js';

export interface CreateSessionInput {
  clientId: string;
  typeId: string;
  startsAt: string; // ISO timestamp
  durationMin?: number;
  location?: string | null;
  priceAgorot?: number;
  courtCostAgorot?: number;
  /** Create a weekly series: this session plus the same slot for the following weeks. */
  repeatWeekly?: boolean;
}

export interface UpdateSessionInput {
  startsAt?: string;
  durationMin?: number;
  location?: string | null;
  priceAgorot?: number;
  courtCostAgorot?: number;
  scope?: 'single' | 'future';
  status?: 'pending' | 'confirmed' | 'cancelled' | 'done';
  cancelReason?: string | null;
  paid?: boolean;
  attendance?: 'arrived' | 'no_show' | null;
  reminderSent?: boolean;
  reminderAnswered?: boolean;
}

/** Number of session instances materialized when "repeat weekly" is on. */
const SERIES_WEEKS = 12;
const PG_INT4_MAX = 2_147_483_647;

const SESSION_STATUSES = new Set(['pending', 'confirmed', 'cancelled', 'done']);
const ATTENDANCE_VALUES = new Set(['arrived', 'no_show']);
const ACTIVE_SESSION_STATUSES = new Set(['pending', 'confirmed']);
const MS_PER_MIN = 60_000;

function money(value: unknown): number {
  const n = Math.trunc(Number(value));
  if (Number.isNaN(n)) return 0;
  return Math.min(Math.max(0, n), PG_INT4_MAX);
}

function text(value: unknown, maxLength = 200): string {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}

/** Weekday (0=Sunday) and "HH:MM" of a UTC instant as seen in Israel. */
function israelParts(date: Date): {
  weekday: number;
  timeLocal: string;
  dateLocal: string;
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    weekday: weekdays.indexOf(parts.weekday),
    timeLocal: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`,
    dateLocal: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function overlaps(
  startsAt: Date,
  durationMin: number,
  busy: { startsAt: Date; durationMin: number }[],
): boolean {
  const start = startsAt.getTime();
  const end = start + durationMin * MS_PER_MIN;
  return busy.some(
    (session) =>
      session.startsAt.getTime() < end &&
      session.startsAt.getTime() + session.durationMin * MS_PER_MIN > start,
  );
}

async function lockCoachDay(
  tx: Prisma.TransactionClient,
  coachId: string,
  dateLocal: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`${coachId}:${dateLocal}`}::text, 0)
    )
  `;
}

/** Offset of Asia/Jerusalem at a given instant, in milliseconds. */
function israelOffsetMs(at: Date): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(
    fmt.formatToParts(at).map((x) => [x.type, x.value]),
  );
  const asIfUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asIfUtc - at.getTime();
}

/**
 * Israel wall-clock date+time -> the matching UTC instant.
 *
 * Weekly recurrence must keep the *local* hour ("every Tuesday at 18:00"),
 * so instances cannot be produced by adding a fixed 7x24h: across Israel's
 * DST switch that shifts the session by an hour. The offset is resolved
 * twice because the first guess can land on the wrong side of a transition.
 */
export function israelWallClockToUtc(
  dateLocal: string,
  timeLocal: string,
): Date {
  const naive = new Date(`${dateLocal}T${timeLocal}:00Z`);
  const firstGuess = new Date(naive.getTime() - israelOffsetMs(naive));
  const settledOffset = israelOffsetMs(firstGuess);
  return new Date(naive.getTime() - settledOffset);
}

/** Add whole days to a yyyy-mm-dd string (calendar arithmetic, no timezone). */
export function addDaysToIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(SMS_PROVIDER) private readonly sms?: SmsProvider,
  ) {}

  // These are `async` so validation failures reject instead of throwing
  // synchronously out of a Promise-returning method.
  async list(
    coachId: string,
    fromIso?: string,
    toIso?: string,
  ): Promise<Session[]> {
    const from = fromIso ? new Date(fromIso) : undefined;
    const to = toIso ? new Date(toIso) : undefined;
    if (
      (from && Number.isNaN(from.getTime())) ||
      (to && Number.isNaN(to.getTime()))
    ) {
      throw new BadRequestException('טווח תאריכים לא תקין');
    }

    return this.prisma.withCoach(coachId, (tx) =>
      tx.session.findMany({
        where: {
          deletedAt: null,
          ...(from || to
            ? {
                startsAt: { ...(from && { gte: from }), ...(to && { lt: to }) },
              }
            : {}),
        },
        orderBy: { startsAt: 'asc' },
      }),
    );
  }

  async create(coachId: string, input: CreateSessionInput): Promise<Session[]> {
    const startsAt = new Date(input?.startsAt ?? '');
    if (!input?.clientId || Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('חסר מתאמן או מועד לא תקין');
    }

    const typeId = text(input.typeId, 50) || 'private';
    const durationMin = Math.min(
      Math.max(15, money(input.durationMin) || 60),
      24 * 60,
    );
    const location = input.location ? text(input.location) : null;
    const priceAgorot = money(input.priceAgorot);
    const explicitCourtCost =
      input.courtCostAgorot === undefined
        ? null
        : money(input.courtCostAgorot);

    return this.prisma.withCoach(coachId, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: input.clientId, deletedAt: null },
      });
      if (!client) throw new NotFoundException('מתאמן לא נמצא');
      const courtCostAgorot =
        explicitCourtCost ??
        (
          await tx.coach.findFirst({
            where: { id: coachId, deletedAt: null },
            select: { defaultCourtCostAgorot: true },
          })
        )?.defaultCourtCostAgorot ??
        0;

      const base: Prisma.SessionUncheckedCreateInput = {
        coachId,
        clientId: client.id,
        typeId,
        startsAt,
        durationMin,
        location,
        priceAgorot,
        courtCostAgorot,
      };

      if (!input.repeatWeekly) {
        await lockCoachDay(tx, coachId, israelParts(startsAt).dateLocal);
        const busy = await tx.session.findMany({
          where: {
            deletedAt: null,
            status: { in: ['pending', 'confirmed'] },
            startsAt: {
              gte: new Date(startsAt.getTime() - 24 * 60 * MS_PER_MIN),
              lt: new Date(startsAt.getTime() + durationMin * MS_PER_MIN),
            },
          },
          select: { startsAt: true, durationMin: true },
        });
        if (overlaps(startsAt, durationMin, busy)) {
          throw new ConflictException('כבר קיים אימון בזמן הזה');
        }
        const [packageId] = await allocatePackageIds(
          tx,
          coachId,
          client.id,
          1,
        );
        return [
          await tx.session.create({
            data: {
              ...base,
              ...(packageId && { packageId }),
              priceAgorot: packageId ? 0 : priceAgorot,
            },
          }),
        ];
      }

      const { weekday, timeLocal, dateLocal } = israelParts(startsAt);
      const occurrences = Array.from({ length: SERIES_WEEKS }, (_, week) =>
        week === 0
          ? startsAt
          : israelWallClockToUtc(
              addDaysToIsoDate(dateLocal, 7 * week),
              timeLocal,
            ),
      );

      for (const occurrence of occurrences) {
        const parts = israelParts(occurrence);
        if (parts.timeLocal !== timeLocal) {
          throw new BadRequestException(
            'לא ניתן ליצור סדרה בשעה הזו בגלל מעבר שעון קיץ',
          );
        }
      }

      const dates = [
        ...new Set(occurrences.map((date) => israelParts(date).dateLocal)),
      ].sort();
      for (const date of dates) await lockCoachDay(tx, coachId, date);

      const firstStart = occurrences[0];
      const lastStart = occurrences[occurrences.length - 1];
      const busy = await tx.session.findMany({
        where: {
          deletedAt: null,
          status: { in: ['pending', 'confirmed'] },
          startsAt: {
            gte: new Date(firstStart.getTime() - 24 * 60 * MS_PER_MIN),
            lt: new Date(lastStart.getTime() + durationMin * MS_PER_MIN),
          },
        },
        select: { startsAt: true, durationMin: true },
      });
      if (
        occurrences.some((occurrence) =>
          overlaps(occurrence, durationMin, busy),
        )
      ) {
        throw new ConflictException('אחד ממועדי הסדרה כבר תפוס');
      }
      const packageIds = await allocatePackageIds(
        tx,
        coachId,
        client.id,
        occurrences.length,
      );

      const series = await tx.sessionSeries.create({
        data: {
          coachId,
          clientId: client.id,
          typeId,
          weekday,
          timeLocal,
          durationMin,
          location,
          priceAgorot,
          courtCostAgorot,
          startsOn: new Date(`${dateLocal}T00:00:00Z`),
        },
      });

      const created = await tx.session.createManyAndReturn({
        data: occurrences.map((occurrence, index) => {
          const packageId = packageIds[index];
          return {
            ...base,
            seriesId: series.id,
            startsAt: occurrence,
            ...(packageId && { packageId }),
            priceAgorot: packageId ? 0 : priceAgorot,
          };
        }),
      });
      return created.sort(
        (left, right) => left.startsAt.getTime() - right.startsAt.getTime(),
      );
    });
  }

  async update(
    coachId: string,
    sessionId: string,
    input: UpdateSessionInput,
  ): Promise<Session> {
    if (
      input.scope !== undefined &&
      input.scope !== 'single' &&
      input.scope !== 'future'
    ) {
      throw new BadRequestException('טווח העריכה לא תקין');
    }
    if (input.status !== undefined && !SESSION_STATUSES.has(input.status)) {
      throw new BadRequestException('סטטוס לא תקין');
    }
    if (
      input.attendance !== undefined &&
      input.attendance !== null &&
      !ATTENDANCE_VALUES.has(input.attendance)
    ) {
      throw new BadRequestException('נוכחות לא תקינה');
    }

    const result = await this.prisma.withCoach(coachId, async (tx) => {
      const existing = await tx.session.findFirst({
        where: { id: sessionId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException();
      const scheduleRequested =
        input.startsAt !== undefined ||
        input.durationMin !== undefined ||
        input.location !== undefined ||
        input.priceAgorot !== undefined ||
        input.courtCostAgorot !== undefined;
      if (existing.status === 'done' && scheduleRequested) {
        throw new BadRequestException('לא ניתן לערוך אימון שהושלם');
      }

      const startsAt =
        input.startsAt !== undefined
          ? new Date(input.startsAt)
          : existing.startsAt;
      if (Number.isNaN(startsAt.getTime())) {
        throw new BadRequestException('מועד לא תקין');
      }
      const durationMin =
        input.durationMin !== undefined
          ? Math.trunc(Number(input.durationMin))
          : existing.durationMin;
      if (
        !Number.isFinite(durationMin) ||
        durationMin < 15 ||
        durationMin > 24 * 60
      ) {
        throw new BadRequestException('משך האימון לא תקין');
      }
      const priceAgorot =
        input.priceAgorot !== undefined
          ? Math.trunc(Number(input.priceAgorot))
          : existing.priceAgorot;
      if (
        !Number.isFinite(priceAgorot) ||
        priceAgorot < 0 ||
        priceAgorot > PG_INT4_MAX
      ) {
        throw new BadRequestException('מחיר לא תקין');
      }
      if (
        existing.packageId &&
        priceAgorot !== existing.priceAgorot
      ) {
        throw new BadRequestException(
          'לא ניתן לשנות מחיר של אימון מכרטיסייה',
        );
      }
      const location =
        input.location !== undefined
          ? input.location === null
            ? null
            : text(input.location)
          : existing.location;
      const courtCostAgorot =
        input.courtCostAgorot !== undefined
          ? Math.trunc(Number(input.courtCostAgorot))
          : existing.courtCostAgorot;
      if (
        !Number.isFinite(courtCostAgorot) ||
        courtCostAgorot < 0 ||
        courtCostAgorot > PG_INT4_MAX
      ) {
        throw new BadRequestException('עלות המגרש לא תקינה');
      }
      const scheduleChanged =
        startsAt.getTime() !== existing.startsAt.getTime() ||
        durationMin !== existing.durationMin ||
        priceAgorot !== existing.priceAgorot ||
        courtCostAgorot !== existing.courtCostAgorot ||
        location !== existing.location;
      const selectedStatus = input.status ?? existing.status;

      const selectedData: Prisma.SessionUncheckedUpdateInput = {
        ...(input.startsAt !== undefined && { startsAt }),
        ...(input.durationMin !== undefined && { durationMin }),
        ...(input.location !== undefined && { location }),
        ...(input.priceAgorot !== undefined && { priceAgorot }),
        ...(input.courtCostAgorot !== undefined && { courtCostAgorot }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.cancelReason !== undefined && {
          cancelReason:
            input.cancelReason === null
              ? null
              : text(input.cancelReason, 500),
        }),
        ...(input.paid !== undefined && { paid: Boolean(input.paid) }),
        ...(input.attendance !== undefined && {
          attendance: input.attendance,
        }),
        ...(input.reminderSent !== undefined && {
          reminderSent: Boolean(input.reminderSent),
        }),
        ...(input.reminderAnswered !== undefined && {
          reminderAnswered: Boolean(input.reminderAnswered),
        }),
        ...(input.status === 'confirmed' && { reminderAnswered: true }),
        ...(scheduleChanged && {
          reminderSent: false,
          reminderAttempts: 0,
          reminderLastAttemptAt: null,
        }),
      };

      if (
        input.scope === 'future' &&
        existing.seriesId &&
        scheduleChanged
      ) {
        const future = await tx.session.findMany({
          where: {
            seriesId: existing.seriesId,
            startsAt: { gte: existing.startsAt },
            deletedAt: null,
            status: { not: 'done' },
          },
          orderBy: { startsAt: 'asc' },
        });
        const anchor = israelParts(startsAt);
        const originalAnchorDate = israelParts(existing.startsAt).dateLocal;
        const planned = future.map((session) => {
          const originalDate = israelParts(session.startsAt).dateLocal;
          const daysFromAnchor = Math.round(
            (new Date(`${originalDate}T00:00:00Z`).getTime() -
              new Date(`${originalAnchorDate}T00:00:00Z`).getTime()) /
              (24 * 60 * 60 * 1000),
          );
          return {
            session,
            startsAt:
              session.id === existing.id
                ? startsAt
                : israelWallClockToUtc(
                    addDaysToIsoDate(anchor.dateLocal, daysFromAnchor),
                    anchor.timeLocal,
                  ),
          };
        });
        const dates = [
          ...new Set(
            planned.flatMap(({ session, startsAt: next }) => [
              israelParts(session.startsAt).dateLocal,
              israelParts(next).dateLocal,
            ]),
          ),
        ].sort();
        for (const date of dates) await lockCoachDay(tx, coachId, date);

        const affectedIds = future.map((session) => session.id);
        const first = planned[0]?.startsAt ?? startsAt;
        const last = planned.at(-1)?.startsAt ?? startsAt;
        const busy = await tx.session.findMany({
          where: {
            id: { notIn: affectedIds },
            deletedAt: null,
            status: { in: ['pending', 'confirmed'] },
            startsAt: {
              gte: new Date(first.getTime() - 24 * 60 * MS_PER_MIN),
              lt: new Date(last.getTime() + durationMin * MS_PER_MIN),
            },
          },
          select: { startsAt: true, durationMin: true },
        });
        if (
          planned.some(
            ({ session, startsAt: next }, index) =>
              ACTIVE_SESSION_STATUSES.has(
                index === 0 ? selectedStatus : session.status,
              ) &&
              overlaps(next, durationMin, busy),
          )
        ) {
          throw new ConflictException('אחד ממועדי הסדרה כבר תפוס');
        }

        let selected: Session | null = null;
        for (const [index, plannedSession] of planned.entries()) {
          const updated = await tx.session.update({
            where: { id: plannedSession.session.id },
            data: {
              startsAt: plannedSession.startsAt,
              durationMin,
              location,
              priceAgorot,
              courtCostAgorot,
              reminderSent: false,
              reminderAttempts: 0,
              reminderLastAttemptAt: null,
              ...(index === 0 ? selectedData : {}),
            },
          });
          if (index === 0) selected = updated;
        }
        await tx.sessionSeries.update({
          where: { id: existing.seriesId },
          data: {
            weekday: anchor.weekday,
            timeLocal: anchor.timeLocal,
            durationMin,
            location,
            priceAgorot,
            courtCostAgorot,
          },
        });
        return {
          session: selected ?? existing,
          notify: existing.status === 'confirmed',
        };
      }

      if (
        scheduleChanged ||
        (ACTIVE_SESSION_STATUSES.has(selectedStatus) &&
          !ACTIVE_SESSION_STATUSES.has(existing.status))
      ) {
        const dates = [
          ...new Set([
            israelParts(existing.startsAt).dateLocal,
            israelParts(startsAt).dateLocal,
          ]),
        ].sort();
        for (const date of dates) await lockCoachDay(tx, coachId, date);
        if (ACTIVE_SESSION_STATUSES.has(selectedStatus)) {
          const busy = await tx.session.findMany({
            where: {
              id: { not: existing.id },
              deletedAt: null,
              status: { in: ['pending', 'confirmed'] },
              startsAt: {
                gte: new Date(startsAt.getTime() - 24 * 60 * MS_PER_MIN),
                lt: new Date(startsAt.getTime() + durationMin * MS_PER_MIN),
              },
            },
            select: { startsAt: true, durationMin: true },
          });
          if (overlaps(startsAt, durationMin, busy)) {
            throw new ConflictException('כבר קיים אימון בזמן הזה');
          }
        }
      }

      const updated = await tx.session.update({
        where: { id: sessionId },
        data: {
          ...selectedData,
          ...(scheduleChanged && existing.seriesId && { seriesId: null }),
        },
      });
      return {
        session: updated,
        notify: scheduleChanged && existing.status === 'confirmed',
      };
    });

    if (result.notify && this.sms) {
      try {
        const recipient = await this.prisma.withCoach(coachId, (tx) =>
          tx.client.findFirst({
            where: { id: result.session.clientId, deletedAt: null },
            select: { phone: true },
          }),
        );
        const phone = recipient ? toE164Israel(recipient.phone) : null;
        if (phone) {
          const parts = israelParts(result.session.startsAt);
          await this.sms.sendText(
            phone,
            `האימון שלך עודכן ל-${parts.dateLocal} בשעה ${parts.timeLocal}.`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Session ${sessionId} updated, but client notification failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return result.session;
  }

  async remove(
    coachId: string,
    sessionId: string,
    scope: 'single' | 'future' = 'single',
  ): Promise<void> {
    if (scope !== 'single' && scope !== 'future') {
      throw new BadRequestException('טווח המחיקה לא תקין');
    }
    await this.prisma.withCoach(coachId, async (tx) => {
      const existing = await tx.session.findFirst({
        where: { id: sessionId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException();
      const deletedAt = new Date();
      if (scope === 'future' && existing.seriesId) {
        await tx.session.updateMany({
          where: {
            seriesId: existing.seriesId,
            startsAt: { gte: existing.startsAt },
            deletedAt: null,
          },
          data: { deletedAt },
        });
        const previousDate = addDaysToIsoDate(
          israelParts(existing.startsAt).dateLocal,
          -1,
        );
        await tx.sessionSeries.update({
          where: { id: existing.seriesId },
          data: { endsOn: new Date(`${previousDate}T00:00:00Z`) },
        });
      } else {
        await tx.session.update({
          where: { id: existing.id },
          data: { deletedAt },
        });
      }
    });
  }
}

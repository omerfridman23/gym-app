import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, Session } from '../generated/prisma/client.js';

export interface CreateSessionInput {
  clientId: string;
  typeId: string;
  startsAt: string; // ISO timestamp
  durationMin?: number;
  location?: string | null;
  priceAgorot?: number;
  /** Create a weekly series: this session plus the same slot for the following weeks. */
  repeatWeekly?: boolean;
}

export interface UpdateSessionInput {
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
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.withCoach(coachId, async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: input.clientId, deletedAt: null },
      });
      if (!client) throw new NotFoundException('מתאמן לא נמצא');

      const base: Prisma.SessionUncheckedCreateInput = {
        coachId,
        clientId: client.id,
        typeId,
        startsAt,
        durationMin,
        location,
        priceAgorot,
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
        return [await tx.session.create({ data: base })];
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
          startsOn: new Date(`${dateLocal}T00:00:00Z`),
        },
      });

      const created: Session[] = [];
      for (const occurrence of occurrences) {
        created.push(
          await tx.session.create({
            data: { ...base, seriesId: series.id, startsAt: occurrence },
          }),
        );
      }
      return created;
    });
  }

  async update(
    coachId: string,
    sessionId: string,
    input: UpdateSessionInput,
  ): Promise<Session> {
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

    return this.prisma.withCoach(coachId, async (tx) => {
      const existing = await tx.session.findFirst({
        where: { id: sessionId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException();

      if (
        input.status !== undefined &&
        ACTIVE_SESSION_STATUSES.has(input.status) &&
        !ACTIVE_SESSION_STATUSES.has(existing.status)
      ) {
        await lockCoachDay(
          tx,
          coachId,
          israelParts(existing.startsAt).dateLocal,
        );
        const busy = await tx.session.findMany({
          where: {
            id: { not: existing.id },
            deletedAt: null,
            status: { in: ['pending', 'confirmed'] },
            startsAt: {
              gte: new Date(
                existing.startsAt.getTime() - 24 * 60 * MS_PER_MIN,
              ),
              lt: new Date(
                existing.startsAt.getTime() +
                  existing.durationMin * MS_PER_MIN,
              ),
            },
          },
          select: { startsAt: true, durationMin: true },
        });
        if (overlaps(existing.startsAt, existing.durationMin, busy)) {
          throw new ConflictException('כבר קיים אימון בזמן הזה');
        }
      }

      return tx.session.update({
        where: { id: sessionId },
        data: {
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
          // Confirming a session implies the client answered the reminder.
          ...(input.status === 'confirmed' && { reminderAnswered: true }),
        },
      });
    });
  }
}

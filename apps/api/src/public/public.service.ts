import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaAdminService } from '../database/prisma-admin.service.js';
import {
  addDaysToIsoDate,
  israelWallClockToUtc,
} from '../sessions/sessions.service.js';
import { israelTime, toE164Israel } from '../reminders/reminders.template.js';

/**
 * Client-facing token links (/confirm/:token, /pay/:clientId) and the public
 * booking page (/book/:slug) — no coach session exists, so lookups use the
 * privileged client, always scoped by an unguessable UUID or by a slug the
 * coach chose to publish.
 */

export interface PublicConfirmInfo {
  clientFirstName: string;
  coachName: string;
  startsAt: string;
  durationMin: number;
  location: string | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'done';
}

export interface PublicPayInfo {
  clientFirstName: string;
  coachName: string;
  sessions: { id: string; startsAt: string; priceAgorot: number }[];
  totalAgorot: number;
}

export interface PublicBookingSlot {
  startsAt: string; // ISO instant
  timeLocal: string; // "HH:MM" Asia/Jerusalem
}

export interface PublicBookingDay {
  date: string; // yyyy-mm-dd Asia/Jerusalem
  slots: PublicBookingSlot[];
}

export interface PublicBookingInfo {
  coachName: string;
  vertical: 'padel' | 'fitness' | null;
  durationMin: number;
  priceAgorot: number;
  days: PublicBookingDay[];
}

export interface PublicBookingResult {
  coachName: string;
  clientFirstName: string;
  startsAt: string;
  date: string;
  timeLocal: string;
  durationMin: number;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Public booking ---

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
/** How many days ahead the booking page offers slots. */
const BOOKING_DAYS = 14;
/** A client cannot grab a slot starting sooner than this. */
const MIN_NOTICE_MS = 2 * 60 * 60 * 1000;
const BOOKING_RATE_WINDOW_MS = 15 * 60 * 1000;
const BOOKINGS_PER_COACH_WINDOW = 30;
/** Session length offered on the public page, by coach vertical. */
const BOOKING_DURATION_MIN: Record<string, number> = { padel: 60, fitness: 50 };
const MS_PER_MIN = 60_000;

/** yyyy-mm-dd of a UTC instant as seen in Israel. */
function israelDateIso(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

interface BusySlot {
  startsAt: Date;
  durationMin: number;
}

function overlapsBusy(
  start: Date,
  durationMin: number,
  busy: BusySlot[],
): boolean {
  const startMs = start.getTime();
  const endMs = startMs + durationMin * MS_PER_MIN;
  return busy.some(
    (s) =>
      s.startsAt.getTime() < endMs &&
      s.startsAt.getTime() + s.durationMin * MS_PER_MIN > startMs,
  );
}

@Injectable()
export class PublicService {
  constructor(private readonly db: PrismaAdminService) {}

  private async sessionByToken(token: string) {
    if (!UUID_RE.test(token ?? '')) throw new NotFoundException();
    const session = await this.db.session.findFirst({
      where: { confirmToken: token, deletedAt: null },
      include: { client: true, coach: true },
    });
    if (!session || session.client.deletedAt || session.coach.deletedAt) {
      throw new NotFoundException();
    }
    return session;
  }

  async getConfirmInfo(token: string): Promise<PublicConfirmInfo> {
    const s = await this.sessionByToken(token);
    return {
      clientFirstName: s.client.name.split(' ')[0],
      coachName: s.coach.name,
      startsAt: s.startsAt.toISOString(),
      durationMin: s.durationMin,
      location: s.location,
      status: s.status,
    };
  }

  async answer(
    token: string,
    answer: 'confirm' | 'decline',
  ): Promise<PublicConfirmInfo> {
    const s = await this.sessionByToken(token);
    const ended = s.startsAt.getTime() + s.durationMin * 60_000 < Date.now();

    // Answers are only accepted while the session hasn't happened yet.
    if (!ended && s.status !== 'done') {
      if (answer === 'confirm' && s.status === 'cancelled') {
        await this.db.$transaction(async (tx) => {
          const dateIso = israelDateIso(s.startsAt);
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${`${s.coachId}:${dateIso}`}::text, 0)
            )
          `;
          const busy = await tx.session.findMany({
            where: {
              id: { not: s.id },
              coachId: s.coachId,
              deletedAt: null,
              status: { in: ['pending', 'confirmed'] },
              startsAt: {
                gte: new Date(s.startsAt.getTime() - 24 * 60 * MS_PER_MIN),
                lt: new Date(
                  s.startsAt.getTime() + s.durationMin * MS_PER_MIN,
                ),
              },
            },
            select: { startsAt: true, durationMin: true },
          });
          if (overlapsBusy(s.startsAt, s.durationMin, busy)) {
            throw new ConflictException(
              'המועד כבר נתפס — יש ליצור קשר עם המאמן',
            );
          }
          await tx.session.update({
            where: { id: s.id },
            data: {
              status: 'confirmed',
              cancelReason: null,
              reminderAnswered: true,
            },
          });
        });
      } else {
        await this.db.session.update({
          where: { id: s.id },
          data:
            answer === 'confirm'
              ? {
                  status: 'confirmed',
                  cancelReason: null,
                  reminderAnswered: true,
                }
              : {
                  status: 'cancelled',
                  cancelReason: 'ביטל/ה דרך הקישור',
                  reminderAnswered: true,
                },
        });
      }
    }

    return this.getConfirmInfo(token);
  }

  async getPayInfo(clientId: string): Promise<PublicPayInfo> {
    if (!UUID_RE.test(clientId ?? '')) throw new NotFoundException();
    const client = await this.db.client.findFirst({
      where: { id: clientId, deletedAt: null },
      include: { coach: true },
    });
    if (!client || client.coach.deletedAt) throw new NotFoundException();

    // Same debt rule as the coach app: chargeable sessions that already
    // happened and weren't paid (past confirmed sessions count as done).
    const sessions = await this.db.session.findMany({
      where: {
        clientId: client.id,
        deletedAt: null,
        paid: false,
        packageId: null,
        priceAgorot: { gt: 0 },
        status: { in: ['confirmed', 'done'] },
        startsAt: { lt: new Date() },
      },
      orderBy: { startsAt: 'desc' },
    });

    const items = sessions.map((s) => ({
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      priceAgorot: s.priceAgorot,
    }));

    return {
      clientFirstName: client.name.split(' ')[0],
      coachName: client.coach.name,
      sessions: items,
      totalAgorot: items.reduce((sum, s) => sum + s.priceAgorot, 0),
    };
  }

  // --- Public booking (/book/:slug) ---

  private normalizedBookingSlug(slug: string): string {
    const normalized = String(slug ?? '')
      .trim()
      .toLowerCase();
    if (!SLUG_RE.test(normalized)) throw new NotFoundException();
    return normalized;
  }

  private async coachBySlug(slug: string) {
    const normalized = this.normalizedBookingSlug(slug);
    const coach = await this.db.coach.findFirst({
      where: { bookingSlug: normalized, bookingEnabled: true, deletedAt: null },
    });
    if (!coach) throw new NotFoundException();
    return coach;
  }

  private bookingDuration(vertical: string | null): number {
    return BOOKING_DURATION_MIN[vertical ?? ''] ?? 60;
  }

  /**
   * Free slots for the next BOOKING_DAYS days: hourly starts inside the
   * coach's local work window, minus anything already on the calendar and
   * anything starting too soon. Cancelled sessions free their slot.
   */
  async getBookingInfo(
    slug: string,
    now: Date = new Date(),
  ): Promise<PublicBookingInfo> {
    // Fetch the coach and schedule in one database round trip. This public
    // share-link endpoint otherwise pays remote Neon latency twice.
    const coach = await this.db.coach.findFirst({
      where: {
        bookingSlug: this.normalizedBookingSlug(slug),
        bookingEnabled: true,
        deletedAt: null,
      },
      include: {
        sessions: {
          where: {
            deletedAt: null,
            status: { in: ['pending', 'confirmed'] },
            // A running session can block the first slots, hence the day back.
            startsAt: {
              gte: new Date(now.getTime() - 24 * 60 * MS_PER_MIN),
              lt: new Date(
                now.getTime() +
                  (BOOKING_DAYS + 1) * 24 * 60 * MS_PER_MIN,
              ),
            },
          },
          select: { startsAt: true, durationMin: true },
        },
      },
    });
    if (!coach) throw new NotFoundException();

    const durationMin = this.bookingDuration(coach.vertical);
    const busy = coach.sessions;
    const todayIso = israelDateIso(now);
    const minStartMs = now.getTime() + MIN_NOTICE_MS;
    const days: PublicBookingDay[] = [];

    for (let day = 0; day < BOOKING_DAYS; day += 1) {
      const date = addDaysToIsoDate(todayIso, day);
      const slots: PublicBookingSlot[] = [];

      for (
        let hour = coach.bookingStartHour;
        hour < coach.bookingEndHour;
        hour += 1
      ) {
        if (hour * 60 + durationMin > coach.bookingEndHour * 60) break;
        const timeLocal = `${String(hour).padStart(2, '0')}:00`;
        const startsAt = israelWallClockToUtc(date, timeLocal);
        // Spring-forward can make a local wall-clock time nonexistent.
        if (
          israelDateIso(startsAt) !== date ||
          israelTime(startsAt) !== timeLocal
        ) {
          continue;
        }
        if (startsAt.getTime() < minStartMs) continue;
        if (overlapsBusy(startsAt, durationMin, busy)) continue;
        slots.push({ startsAt: startsAt.toISOString(), timeLocal });
      }

      days.push({ date, slots });
    }

    return {
      coachName: coach.name,
      vertical: coach.vertical,
      durationMin,
      priceAgorot: coach.defaultPriceAgorot,
      days,
    };
  }

  /**
   * Books a free slot: finds or creates the client by phone, then creates a
   * pending session the coach sees like any other. The slot is re-checked
   * inside the transaction so two clients cannot grab the same hour.
   */
  async book(
    slug: string,
    input: { startsAt?: string; name?: string; phone?: string },
    now: Date = new Date(),
  ): Promise<PublicBookingResult> {
    const coach = await this.coachBySlug(slug);
    const durationMin = this.bookingDuration(coach.vertical);

    const name = String(input?.name ?? '')
      .trim()
      .slice(0, 100);
    if (!name) throw new BadRequestException('צריך שם כדי לקבוע אימון');

    const phone = toE164Israel(String(input?.phone ?? ''));
    if (!phone) throw new BadRequestException('מספר הנייד לא נראה תקין');

    const startsAt = new Date(String(input?.startsAt ?? ''));
    if (Number.isNaN(startsAt.getTime()))
      throw new BadRequestException('מועד לא תקין');

    // The instant must be a slot the page actually offers: on the hour grid,
    // inside the work window, far enough ahead, within the booking horizon.
    const timeLocal = israelTime(startsAt);
    const [hour, minute] = timeLocal.split(':').map(Number);
    const dateIso = israelDateIso(startsAt);
    const todayIso = israelDateIso(now);
    const withinWindow =
      minute === 0 &&
      hour >= coach.bookingStartHour &&
      hour * 60 + durationMin <= coach.bookingEndHour * 60;
    const withinHorizon =
      dateIso >= todayIso &&
      dateIso <= addDaysToIsoDate(todayIso, BOOKING_DAYS - 1);
    const canonicalStart = israelWallClockToUtc(dateIso, timeLocal);
    if (
      !withinWindow ||
      !withinHorizon ||
      canonicalStart.getTime() !== startsAt.getTime() ||
      startsAt.getTime() < now.getTime() + MIN_NOTICE_MS
    ) {
      throw new BadRequestException('המועד הזה לא זמין לקביעה');
    }

    return this.db.$transaction(async (tx) => {
      // Serialize matching phones as well as dates. Without this lock, two
      // requests for different dates can create duplicate client rows and
      // each bypass the per-client pending-booking ceiling.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${coach.id}:phone:${phone}`}::text, 0)
        )
      `;

      // Serialize public bookings for this coach/day before checking
      // availability. A plain transaction is not enough under Postgres
      // READ COMMITTED: two requests can both read "free" and then insert.
      // The transaction-scoped advisory lock makes the second request wait
      // and observe the first insert without leaving persistent lock rows.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${coach.id}:${dateIso}`}::text, 0)
        )
      `;

      // Re-check the slot after taking the lock to close the race between
      // two public clients grabbing the same hour.
      const nearby = await tx.session.findMany({
        where: {
          coachId: coach.id,
          deletedAt: null,
          status: { in: ['pending', 'confirmed'] },
          startsAt: {
            gte: new Date(startsAt.getTime() - 24 * 60 * MS_PER_MIN),
            lt: new Date(startsAt.getTime() + durationMin * MS_PER_MIN),
          },
        },
        select: { startsAt: true, durationMin: true },
      });
      if (overlapsBusy(startsAt, durationMin, nearby)) {
        throw new ConflictException('המועד הזה בדיוק נתפס — בחרו שעה אחרת');
      }

      // Durable, multi-instance abuse ceiling. It intentionally counts all
      // loose pending sessions, not only rows attributed to a browser IP:
      // proxies make IP identity unreliable, while calendar spam is the
      // resource we actually need to bound.
      const recentPending = await tx.session.count({
        where: {
          coachId: coach.id,
          deletedAt: null,
          seriesId: null,
          status: 'pending',
          createdAt: {
            gte: new Date(now.getTime() - BOOKING_RATE_WINDOW_MS),
          },
        },
      });
      if (recentPending >= BOOKINGS_PER_COACH_WINDOW) {
        throw new HttpException(
          'יותר מדי בקשות כרגע — נסו שוב בעוד כמה דקות',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Returning clients are recognized by phone; new ones get a card with
      // the coach's default price.
      let client = await tx.client.findFirst({
        where: {
          coachId: coach.id,
          normalizedPhone: phone,
          deletedAt: null,
        },
        select: { id: true, phone: true, priceAgorot: true },
      });

      if (client) {
        // A stranger with one phone number must not be able to flood the
        // calendar: series sessions don't count, only loose pending ones.
        const upcoming = await tx.session.count({
          where: {
            clientId: client.id,
            deletedAt: null,
            seriesId: null,
            status: 'pending',
            startsAt: { gt: now },
          },
        });
        if (upcoming >= 4) {
          throw new ConflictException(
            'יש כבר כמה אימונים שממתינים לאישור — דברו עם המאמן ישירות',
          );
        }
      } else {
        client = await tx.client.create({
          data: {
            coachId: coach.id,
            name,
            phone,
            normalizedPhone: phone,
            priceAgorot: coach.defaultPriceAgorot,
          },
          select: { id: true, phone: true, priceAgorot: true },
        });
      }

      const session = await tx.session.create({
        data: {
          coachId: coach.id,
          clientId: client.id,
          typeId: 'private',
          startsAt,
          durationMin,
          location: null,
          priceAgorot: client.priceAgorot,
          status: 'pending',
        },
      });

      return {
        coachName: coach.name,
        clientFirstName: name.split(' ')[0],
        startsAt: session.startsAt.toISOString(),
        date: dateIso,
        timeLocal,
        durationMin,
      };
    });
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Coach } from '../generated/prisma/client.js';

export interface UpdateCoachInput {
  name?: string;
  vertical?: 'padel' | 'fitness';
  defaultPriceAgorot?: number;
  reminderHoursBefore?: number;
  cancellationPolicy?: string;
  templates?: { reminder?: string; debt?: string };
  /** Public self-booking page (/book/:slug). */
  bookingSlug?: string | null;
  bookingEnabled?: boolean;
  bookingStartHour?: number;
  bookingEndHour?: number;
}

export interface CoachProfile {
  id: string;
  phone: string;
  name: string;
  vertical: 'padel' | 'fitness' | null;
  defaultPriceAgorot: number;
  reminderHoursBefore: number;
  cancellationPolicy: string;
  templates: { reminder?: string; debt?: string };
  onboarded: boolean;
  bookingSlug: string | null;
  bookingEnabled: boolean;
  bookingStartHour: number;
  bookingEndHour: number;
}

const PG_INT4_MAX = 2_147_483_647;
const NAME_MAX_LENGTH = 200;
const POLICY_MAX_LENGTH = 2000;
const TEMPLATE_MAX_LENGTH = 1000;

// The body reaches the service unvalidated (no global ValidationPipe), so
// every field is validated or sanitized here.
function sanitizeText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, maxLength);
}

function sanitizeInt(value: unknown, min: number): number {
  const n = Math.trunc(Number(value));
  if (Number.isNaN(n)) return min;
  return Math.min(Math.max(min, n), PG_INT4_MAX);
}

// Latin letters, digits and inner hyphens, 3–30 chars — it becomes a URL path.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** Normalized booking slug, `null` to clear it, or a 400 when malformed. */
function sanitizeSlug(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException('כתובת הקישור חייבת להיות טקסט');
  }
  const slug = value.trim().toLowerCase();
  if (slug === '') return null;
  if (!SLUG_RE.test(slug)) {
    throw new BadRequestException(
      'כתובת הקישור יכולה להכיל אותיות באנגלית, מספרים ומקפים (3–30 תווים)',
    );
  }
  return slug;
}

function sanitizeHour(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 24
  ) {
    throw new BadRequestException('שעות הפעילות חייבות להיות מספרים שלמים');
  }
  return value;
}

function sanitizeTemplates(value: unknown): {
  reminder?: string;
  debt?: string;
} {
  if (typeof value !== 'object' || value === null) return {};
  const raw = value as Record<string, unknown>;
  const out: { reminder?: string; debt?: string } = {};
  if (raw.reminder !== undefined)
    out.reminder = sanitizeText(raw.reminder, TEMPLATE_MAX_LENGTH);
  if (raw.debt !== undefined)
    out.debt = sanitizeText(raw.debt, TEMPLATE_MAX_LENGTH);
  return out;
}

export function toProfile(coach: Coach): CoachProfile {
  const templates =
    typeof coach.templates === 'object' &&
    coach.templates !== null &&
    !Array.isArray(coach.templates)
      ? (coach.templates as { reminder?: string; debt?: string })
      : {};
  return {
    id: coach.id,
    phone: coach.phone,
    name: coach.name,
    vertical: coach.vertical,
    defaultPriceAgorot: coach.defaultPriceAgorot,
    reminderHoursBefore: coach.reminderHoursBefore,
    cancellationPolicy: coach.cancellationPolicy,
    templates,
    onboarded: coach.onboardedAt !== null,
    bookingSlug: coach.bookingSlug,
    bookingEnabled: coach.bookingEnabled,
    bookingStartHour: coach.bookingStartHour,
    bookingEndHour: coach.bookingEndHour,
  };
}

@Injectable()
export class CoachesService {
  constructor(private readonly prisma: PrismaService) {}

  getMe(coachId: string): Promise<Coach> {
    return this.prisma.withCoach(coachId, async (tx) => {
      const coach = await tx.coach.findFirst({
        where: { id: coachId, deletedAt: null },
      });
      if (!coach) throw new NotFoundException();
      return coach;
    });
  }

  updateMe(coachId: string, input: UpdateCoachInput): Promise<Coach> {
    return this.prisma.withCoach(coachId, async (tx) => {
      const existing = await tx.coach.findFirst({
        where: { id: coachId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException();

      // Booking fields are validated against the *resulting* state, so a
      // partial PATCH can't enable the page without a slug or invert the
      // work-hour window.
      const nextSlug =
        input.bookingSlug !== undefined
          ? sanitizeSlug(input.bookingSlug)
          : existing.bookingSlug;
      const nextEnabled =
        input.bookingEnabled !== undefined
          ? (() => {
              if (typeof input.bookingEnabled !== 'boolean') {
                throw new BadRequestException(
                  'מצב קביעת התורים חייב להיות ערך בוליאני',
                );
              }
              return input.bookingEnabled;
            })()
          : existing.bookingEnabled;
      const nextStartHour =
        input.bookingStartHour !== undefined
          ? sanitizeHour(input.bookingStartHour)
          : existing.bookingStartHour;
      const nextEndHour =
        input.bookingEndHour !== undefined
          ? sanitizeHour(input.bookingEndHour)
          : existing.bookingEndHour;

      if (nextEnabled && !nextSlug) {
        throw new BadRequestException(
          'כדי להפעיל קביעת תורים יש לבחור כתובת לקישור',
        );
      }
      if (nextStartHour >= nextEndHour) {
        throw new BadRequestException('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
      }

      try {
        return await tx.coach.update({
          where: { id: coachId },
          data: {
            ...(input.name !== undefined && {
              name: sanitizeText(input.name, NAME_MAX_LENGTH),
            }),
            ...(input.vertical !== undefined && { vertical: input.vertical }),
            ...(input.defaultPriceAgorot !== undefined && {
              defaultPriceAgorot: sanitizeInt(input.defaultPriceAgorot, 0),
            }),
            ...(input.reminderHoursBefore !== undefined && {
              reminderHoursBefore: sanitizeInt(input.reminderHoursBefore, 1),
            }),
            ...(input.cancellationPolicy !== undefined && {
              cancellationPolicy: sanitizeText(
                input.cancellationPolicy,
                POLICY_MAX_LENGTH,
              ),
            }),
            ...(input.templates !== undefined && {
              templates: {
                ...toProfile(existing).templates,
                ...sanitizeTemplates(input.templates),
              },
            }),
            ...(input.bookingSlug !== undefined && { bookingSlug: nextSlug }),
            ...(input.bookingEnabled !== undefined && {
              bookingEnabled: nextEnabled,
            }),
            ...(input.bookingStartHour !== undefined && {
              bookingStartHour: nextStartHour,
            }),
            ...(input.bookingEndHour !== undefined && {
              bookingEndHour: nextEndHour,
            }),
            // Choosing a vertical for the first time completes onboarding.
            ...(input.vertical !== undefined &&
              existing.onboardedAt === null && { onboardedAt: new Date() }),
          },
        });
      } catch (error) {
        // Unique violation on booking_slug — someone else got there first.
        if ((error as { code?: string }).code === 'P2002') {
          throw new ConflictException('הכתובת הזו כבר תפוסה — נסו כתובת אחרת');
        }
        throw error;
      }
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Coach } from '../generated/prisma/client.js';

export interface UpdateCoachInput {
  name?: string;
  vertical?: 'padel' | 'fitness';
  defaultPriceAgorot?: number;
  reminderHoursBefore?: number;
  cancellationPolicy?: string;
  templates?: { reminder?: string; debt?: string };
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
}

const PG_INT4_MAX = 2_147_483_647;
const NAME_MAX_LENGTH = 200;
const POLICY_MAX_LENGTH = 2000;
const TEMPLATE_MAX_LENGTH = 1000;

// The body reaches the service unvalidated (no global ValidationPipe), so
// every field is sanitized here: coerced to the right type, clamped to the
// int4 range, and bounded in length.
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

function sanitizeTemplates(value: unknown): { reminder?: string; debt?: string } {
  if (typeof value !== 'object' || value === null) return {};
  const raw = value as Record<string, unknown>;
  const out: { reminder?: string; debt?: string } = {};
  if (raw.reminder !== undefined) out.reminder = sanitizeText(raw.reminder, TEMPLATE_MAX_LENGTH);
  if (raw.debt !== undefined) out.debt = sanitizeText(raw.debt, TEMPLATE_MAX_LENGTH);
  return out;
}

export function toProfile(coach: Coach): CoachProfile {
  const templates =
    typeof coach.templates === 'object' && coach.templates !== null && !Array.isArray(coach.templates)
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
  };
}

@Injectable()
export class CoachesService {
  constructor(private readonly prisma: PrismaService) {}

  getMe(coachId: string): Promise<Coach> {
    return this.prisma.withCoach(coachId, async (tx) => {
      const coach = await tx.coach.findFirst({ where: { id: coachId, deletedAt: null } });
      if (!coach) throw new NotFoundException();
      return coach;
    });
  }

  updateMe(coachId: string, input: UpdateCoachInput): Promise<Coach> {
    return this.prisma.withCoach(coachId, async (tx) => {
      const existing = await tx.coach.findFirst({ where: { id: coachId, deletedAt: null } });
      if (!existing) throw new NotFoundException();

      return tx.coach.update({
        where: { id: coachId },
        data: {
          ...(input.name !== undefined && { name: sanitizeText(input.name, NAME_MAX_LENGTH) }),
          ...(input.vertical !== undefined && { vertical: input.vertical }),
          ...(input.defaultPriceAgorot !== undefined && {
            defaultPriceAgorot: sanitizeInt(input.defaultPriceAgorot, 0),
          }),
          ...(input.reminderHoursBefore !== undefined && {
            reminderHoursBefore: sanitizeInt(input.reminderHoursBefore, 1),
          }),
          ...(input.cancellationPolicy !== undefined && {
            cancellationPolicy: sanitizeText(input.cancellationPolicy, POLICY_MAX_LENGTH),
          }),
          ...(input.templates !== undefined && {
            templates: {
              ...toProfile(existing).templates,
              ...sanitizeTemplates(input.templates),
            },
          }),
          // Choosing a vertical for the first time completes onboarding.
          ...(input.vertical !== undefined && existing.onboardedAt === null && { onboardedAt: new Date() }),
        },
      });
    });
  }
}

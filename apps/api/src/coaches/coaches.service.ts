import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Coach } from '../generated/prisma/client.js';

export interface UpdateCoachInput {
  name?: string;
  vertical?: 'padel' | 'fitness';
  defaultPriceAgorot?: number;
  reminderHoursBefore?: number;
  cancellationPolicy?: string;
}

const PG_INT4_MAX = 2_147_483_647;
const NAME_MAX_LENGTH = 200;
const POLICY_MAX_LENGTH = 2000;

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

@Injectable()
export class CoachesService {
  constructor(private readonly prisma: PrismaService) {}

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
          // Choosing a vertical for the first time completes onboarding.
          ...(input.vertical !== undefined && existing.onboardedAt === null && { onboardedAt: new Date() }),
        },
      });
    });
  }
}

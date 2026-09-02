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
          ...(input.name !== undefined && { name: input.name.trim() }),
          ...(input.vertical !== undefined && { vertical: input.vertical }),
          ...(input.defaultPriceAgorot !== undefined && {
            defaultPriceAgorot: Math.max(0, Math.trunc(input.defaultPriceAgorot)),
          }),
          ...(input.reminderHoursBefore !== undefined && {
            reminderHoursBefore: Math.max(1, Math.trunc(input.reminderHoursBefore)),
          }),
          ...(input.cancellationPolicy !== undefined && { cancellationPolicy: input.cancellationPolicy }),
          // Choosing a vertical for the first time completes onboarding.
          ...(input.vertical !== undefined && existing.onboardedAt === null && { onboardedAt: new Date() }),
        },
      });
    });
  }
}

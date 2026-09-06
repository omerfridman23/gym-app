import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service.js';
import type { Session } from '../generated/prisma/client.js';
import { toProfile } from '../coaches/coaches.service.js';
import {
  DEFAULT_REMINDER_TEMPLATE,
  fillTemplate,
  israelTime,
  reminderVars,
  resolveWebOrigin,
  toWhatsappNumber,
} from './reminders.template.js';

// Re-exported so callers (and tests) can keep importing them from here.
export { DEFAULT_REMINDER_TEMPLATE, fillTemplate, israelTime, toWhatsappNumber };

/**
 * Reminder scheduling. The app sends reminders over WhatsApp links (there is
 * no WhatsApp Business API here), so the server owns the *scheduling* decision
 * — which sessions are due, based on each coach's `reminderHoursBefore` — and
 * renders the ready-to-send message. The coach taps once to send, and the
 * session is then marked as reminded so it never resurfaces.
 */

export interface DueReminder {
  sessionId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  startsAt: string;
  timeLocal: string;
  durationMin: number;
  location: string | null;
  message: string;
  confirmUrl: string;
  whatsappUrl: string;
}

const MS_PER_HOUR = 60 * 60 * 1000;

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Public origin used in client-facing links (falls back to the dev web port). */
  private webOrigin(): string {
    return resolveWebOrigin(
      this.config.get<string>('PUBLIC_WEB_URL'),
      this.config.get<string>('WEB_ORIGIN'),
    );
  }

  /**
   * Sessions whose reminder is due now: starting within the coach's reminder
   * window, not yet reminded, and still expecting the client to show up.
   */
  async listDue(coachId: string, now: Date = new Date()): Promise<DueReminder[]> {
    const origin = this.webOrigin();

    return this.prisma.withCoach(coachId, async (tx) => {
      const coach = await tx.coach.findFirst({ where: { id: coachId, deletedAt: null } });
      if (!coach) throw new NotFoundException();

      const windowEnd = new Date(now.getTime() + coach.reminderHoursBefore * MS_PER_HOUR);
      const sessions = await tx.session.findMany({
        where: {
          deletedAt: null,
          reminderSent: false,
          // A client who already answered the link needs no nudge, even if
          // the coach never sent one.
          reminderAnswered: false,
          status: { in: ['pending', 'confirmed'] },
          startsAt: { gte: now, lte: windowEnd },
        },
        include: { client: true },
        orderBy: { startsAt: 'asc' },
      });

      const template = toProfile(coach).templates.reminder || DEFAULT_REMINDER_TEMPLATE;

      return sessions
        .filter((session) => session.client && session.client.deletedAt === null)
        .map((session) => {
          const confirmUrl = `${origin}/confirm/${session.confirmToken}`;
          const message = fillTemplate(
            template,
            reminderVars({
              clientName: session.client.name,
              coachName: coach.name,
              time: israelTime(session.startsAt),
              location: session.location,
              confirmUrl,
            }),
          );

          return {
            sessionId: session.id,
            clientId: session.clientId,
            clientName: session.client.name,
            clientPhone: session.client.phone,
            startsAt: session.startsAt.toISOString(),
            timeLocal: israelTime(session.startsAt),
            durationMin: session.durationMin,
            location: session.location,
            message,
            confirmUrl,
            whatsappUrl: `https://wa.me/${toWhatsappNumber(session.client.phone)}?text=${encodeURIComponent(message)}`,
          };
        });
    });
  }

  /** Marks a reminder as sent so it drops out of the due list. */
  markSent(coachId: string, sessionId: string): Promise<Session> {
    return this.prisma.withCoach(coachId, async (tx) => {
      const existing = await tx.session.findFirst({ where: { id: sessionId, deletedAt: null } });
      if (!existing) throw new NotFoundException();

      return tx.session.update({ where: { id: sessionId }, data: { reminderSent: true } });
    });
  }
}

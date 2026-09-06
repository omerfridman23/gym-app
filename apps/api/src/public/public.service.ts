import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaAdminService } from '../database/prisma-admin.service.js';

/**
 * Client-facing token links (/confirm/:token, /pay/:clientId) — no coach
 * session exists, so lookups use the privileged client, always scoped by an
 * unguessable UUID from the link.
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  async answer(token: string, answer: 'confirm' | 'decline'): Promise<PublicConfirmInfo> {
    const s = await this.sessionByToken(token);
    const ended = s.startsAt.getTime() + s.durationMin * 60_000 < Date.now();

    // Answers are only accepted while the session hasn't happened yet.
    if (!ended && s.status !== 'done') {
      await this.db.session.update({
        where: { id: s.id },
        data:
          answer === 'confirm'
            ? { status: 'confirmed', cancelReason: null, reminderAnswered: true }
            : { status: 'cancelled', cancelReason: 'ביטל/ה דרך הקישור', reminderAnswered: true },
      });
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
}

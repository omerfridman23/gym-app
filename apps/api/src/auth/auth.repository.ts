import { Injectable } from '@nestjs/common';
import { PrismaAdminService } from '../database/prisma-admin.service.js';
import type { Coach, OtpCode } from '../generated/prisma/client.js';

/**
 * Pre-auth persistence. Uses the privileged client because these flows run
 * before a coach identity exists (otp_codes is owner-only by RLS design).
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly db: PrismaAdminService) {}

  countRecentOtpRequests(phone: string, since: Date): Promise<number> {
    return this.db.otpCode.count({ where: { phone, createdAt: { gte: since } } });
  }

  async createOtp(phone: string, codeHash: string, expiresAt: Date): Promise<OtpCode> {
    // A new code supersedes any previous outstanding one for this phone.
    await this.db.otpCode.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return this.db.otpCode.create({ data: { phone, codeHash, expiresAt } });
  }

  findActiveOtp(phone: string): Promise<OtpCode | null> {
    return this.db.otpCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async recordFailedAttempt(id: string): Promise<number> {
    const updated = await this.db.otpCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
    return updated.attempts;
  }

  async consumeOtp(id: string): Promise<void> {
    await this.db.otpCode.update({ where: { id }, data: { consumedAt: new Date() } });
  }

  findOrCreateCoach(phone: string): Promise<Coach> {
    return this.db.coach.upsert({
      where: { phone },
      update: {},
      create: { phone },
    });
  }

  findOrCreateDevCoach(phone: string, name: string): Promise<Coach> {
    return this.db.coach.upsert({
      where: { phone },
      update: {
        deletedAt: null,
        name,
        vertical: 'fitness',
        onboardedAt: new Date(),
      },
      create: {
        phone,
        name,
        vertical: 'fitness',
        onboardedAt: new Date(),
      },
    });
  }
}

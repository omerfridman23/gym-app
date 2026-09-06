/**
 * Shared harness for the end-to-end suite.
 *
 * These tests drive the real application over HTTP: the real Nest module graph,
 * the real guards and controllers, and a real Postgres with RLS enforced (the
 * runtime client connects as `app_user`, exactly as in production). The only
 * substitution is the SMS transport — a recording fake stands in for the
 * gateway so the login flow can be completed without sending (and paying for)
 * a message. Everything else is production code.
 *
 * Requires a migrated database: `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and
 * `JWT_SECRET` are read from `.env.local` by the app's own ConfigModule.
 */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { SMS_PROVIDER, type SmsProvider } from '../src/auth/sms/sms-provider.js';
import { PrismaAdminService } from '../src/database/prisma-admin.service.js';

/** Stands in for the SMS gateway and remembers the codes it was asked to send. */
export class RecordingSmsProvider implements SmsProvider {
  readonly texts: { phone: string; message: string }[] = [];
  /** Last OTP per phone, in E.164 — the only way a test can learn the code. */
  readonly codes = new Map<string, string>();

  async sendText(phone: string, message: string): Promise<void> {
    this.texts.push({ phone, message });
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    this.codes.set(phone, code);
  }
}

export interface E2eContext {
  app: INestApplication;
  sms: RecordingSmsProvider;
  admin: PrismaAdminService;
  /** Supertest bound to the running app. */
  http: () => request.Agent;
  /** Registers a coach (by phone) for teardown. */
  track: (coachId: string, phone: string) => void;
  close: () => Promise<void>;
}

/** A unique, valid Israeli mobile, so parallel runs never collide on a coach. */
export function randomIsraeliPhone(): string {
  const digits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('');
  return `05${digits}`;
}

/** 05XXXXXXXX -> +9725XXXXXXXX, mirroring AuthService.normalizePhone. */
export function toE164(local: string): string {
  return `+972${local.slice(1)}`;
}

export async function createE2eApp(): Promise<E2eContext> {
  const sms = new RecordingSmsProvider();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(sms)
    .compile();

  const app = moduleRef.createNestApplication();
  // Mirror main.ts so the routes under test have their production shape.
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  await app.init();

  const admin = moduleRef.get(PrismaAdminService);
  const coachIds: string[] = [];
  const phones: string[] = [];

  return {
    app,
    sms,
    admin,
    http: () => request(app.getHttpServer() as App),
    track: (coachId, phone) => {
      coachIds.push(coachId);
      phones.push(toE164(phone));
    },
    close: async () => {
      // Hard-delete in FK order: the app only ever soft-deletes, so tests must
      // clean up after themselves or the shared database accumulates fixtures.
      if (coachIds.length > 0) {
        const where = { where: { coachId: { in: coachIds } } };
        await admin.payment.deleteMany(where);
        await admin.session.deleteMany(where);
        await admin.package.deleteMany(where);
        await admin.sessionSeries.deleteMany(where);
        await admin.client.deleteMany(where);
        await admin.coach.deleteMany({ where: { id: { in: coachIds } } });
      }
      if (phones.length > 0) {
        await admin.otpCode.deleteMany({ where: { phone: { in: phones } } });
      }
      await app.close();
    },
  };
}

export interface LoggedInCoach {
  /** Value for the `Cookie` header on authenticated requests. */
  cookie: string;
  coachId: string;
  phone: string;
}

/**
 * Completes the real login flow: request an OTP, read the code out of the fake
 * gateway, verify it, and keep the session cookie.
 */
export async function login(ctx: E2eContext, phone = randomIsraeliPhone()): Promise<LoggedInCoach> {
  await ctx.http().post('/api/auth/otp/request').send({ phone }).expect(204);

  const code = ctx.sms.codes.get(toE164(phone));
  if (!code) throw new Error(`no OTP was sent to ${phone}`);

  const verified = await ctx.http().post('/api/auth/otp/verify').send({ phone, code }).expect(201);

  const setCookie = verified.headers['set-cookie'] as unknown as string[];
  const cookie = setCookie.map((entry) => entry.split(';')[0]).join('; ');
  const coachId = (verified.body as { coach: { id: string } }).coach.id;

  ctx.track(coachId, phone);
  return { cookie, coachId, phone };
}

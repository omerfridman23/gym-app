import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmsSendError } from '../auth/sms/sms-provider.js';
import { RemindersWorker } from './reminders.worker.js';

/** A Sunday 09:00 Israel time (06:00 UTC, DST) — outside quiet hours. */
const DAYTIME = new Date('2026-09-06T06:00:00Z');
/** 02:00 Israel time — inside the default quiet window. */
const NIGHT = new Date('2026-09-06T23:00:00Z');

const ENV = {
  REMINDERS_ENABLED: 'true',
  PUBLIC_WEB_URL: 'https://app.example.com',
  SMS_DRIVER: '019',
};

function configOf(values: Record<string, string | undefined> = {}): ConfigService {
  const merged = { ...ENV, ...values };
  return { get: (key: string) => merged[key as keyof typeof merged] } as ConfigService;
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    startsAt: new Date('2026-09-07T15:00:00Z'), // 18:00 Israel
    location: 'מגרש 1',
    confirmToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    client: { id: 'client-1', name: 'רון אביב', phone: '0545551201' },
    coach: {
      id: 'coach-1',
      phone: '+972501112222',
      name: 'דנה',
      vertical: 'padel',
      defaultPriceAgorot: 18000,
      reminderHoursBefore: 24,
      cancellationPolicy: '',
      templates: {},
      onboardedAt: new Date('2026-01-01T00:00:00Z'),
    },
    ...overrides,
  };
}

interface Harness {
  worker: RemindersWorker;
  db: {
    $queryRaw: ReturnType<typeof vi.fn>;
    session: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  };
  sms: { sendText: ReturnType<typeof vi.fn>; sendOtp: ReturnType<typeof vi.fn> };
  /** Full SQL text of the claim statement, with parameters interpolated out. */
  claimSql: () => string;
  claimParams: () => unknown[];
}

function harness(
  env: Record<string, string | undefined> = {},
  rows: { id: string; attempts: number }[] = [{ id: 'session-1', attempts: 1 }],
  sessions = [sessionRow()],
): Harness {
  const db = {
    $queryRaw: vi.fn().mockResolvedValue(rows),
    session: {
      findMany: vi.fn().mockResolvedValue(sessions),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const sms = { sendText: vi.fn().mockResolvedValue(undefined), sendOtp: vi.fn() };
  const worker = new RemindersWorker(db as never, configOf(env), sms as never);

  return {
    worker,
    db,
    sms,
    claimSql: () => (db.$queryRaw.mock.calls[0][0] as string[]).join(' ? ').replace(/\s+/g, ' '),
    claimParams: () => (db.$queryRaw.mock.calls[0] as unknown[]).slice(1),
  };
}

describe('RemindersWorker', () => {
  // Tests that go through `tick()` inherit the wall clock, which would send the
  // run down the quiet-hours path whenever the suite happens to run in the
  // evening. Pinning the clock to daytime keeps the results time-independent;
  // tests that call `runOnce(now)` pass the instant they care about anyway.
  beforeEach(() => {
    vi.useFakeTimers({ now: DAYTIME, toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('opt-in', () => {
    it('does nothing at all unless REMINDERS_ENABLED is set (SMS costs money)', async () => {
      const h = harness({ REMINDERS_ENABLED: undefined });

      expect(await h.worker.runOnce(DAYTIME)).toEqual({
        claimed: 0,
        sent: 0,
        failed: 0,
        skipped: 'disabled',
      });
      expect(h.db.$queryRaw).not.toHaveBeenCalled();
      expect(h.sms.sendText).not.toHaveBeenCalled();
    });

    it('treats a non-truthy flag as off, not as on', async () => {
      for (const value of ['false', '0', 'no', '', 'maybe']) {
        const h = harness({ REMINDERS_ENABLED: value });
        expect((await h.worker.runOnce(DAYTIME)).skipped).toBe('disabled');
      }
    });

    it('accepts the usual truthy spellings', async () => {
      for (const value of ['true', 'TRUE', '1', 'yes', 'on']) {
        const h = harness({ REMINDERS_ENABLED: value });
        expect((await h.worker.runOnce(DAYTIME)).skipped).toBeUndefined();
      }
    });

    it('never starts a timer while disabled', () => {
      const h = harness({ REMINDERS_ENABLED: 'false' });
      const spy = vi.spyOn(globalThis, 'setInterval');
      h.worker.onApplicationBootstrap();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('quiet hours', () => {
    it('sends nothing in the middle of the night', async () => {
      const h = harness();

      expect((await h.worker.runOnce(NIGHT)).skipped).toBe('quiet-hours');
      // Nothing is claimed, so no attempt is burned: the reminder goes out
      // intact once the window opens.
      expect(h.db.$queryRaw).not.toHaveBeenCalled();
    });

    it('resumes as soon as the quiet window ends', async () => {
      const h = harness();
      const eightAm = new Date('2026-09-06T05:00:00Z'); // 08:00 Israel
      expect((await h.worker.runOnce(eightAm)).skipped).toBeUndefined();
    });

    it('honours a custom window that does not wrap midnight', async () => {
      const h = harness({ REMINDERS_QUIET_START_HOUR: '8', REMINDERS_QUIET_END_HOUR: '20' });
      // 09:00 Israel is now inside the window.
      expect((await h.worker.runOnce(DAYTIME)).skipped).toBe('quiet-hours');
      // 02:00 Israel is outside it.
      expect((await h.worker.runOnce(NIGHT)).skipped).toBeUndefined();
    });

    it('can be turned off entirely with an empty window', async () => {
      const h = harness({ REMINDERS_QUIET_START_HOUR: '0', REMINDERS_QUIET_END_HOUR: '0' });
      expect((await h.worker.runOnce(NIGHT)).skipped).toBeUndefined();
    });
  });

  describe('claiming', () => {
    it('claims and sends in one pass, then marks the session reminded', async () => {
      const h = harness();

      expect(await h.worker.runOnce(DAYTIME)).toEqual({ claimed: 1, sent: 1, failed: 0 });
      expect(h.sms.sendText).toHaveBeenCalledTimes(1);
      expect(h.db.session.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { reminderSent: true },
      });
    });

    it('claims by stamping the attempt before sending, so a second worker cannot', () => {
      const h = harness();
      void h.worker.runOnce(DAYTIME);

      const sql = h.claimSql();
      expect(sql).toContain('UPDATE sessions');
      expect(sql).toContain('reminder_attempts = s.reminder_attempts + 1');
      expect(sql).toContain('reminder_last_attempt_at =');
      expect(sql).toContain('SKIP LOCKED');
      // Guards repeated in the outer WHERE — that is what makes the lock
      // re-check exclude a row another worker just claimed.
      expect(sql).toMatch(/UPDATE sessions s.*WHERE s\.reminder_sent = false/s);
    });

    it('only considers upcoming sessions a client is still expected at', () => {
      const h = harness();
      void h.worker.runOnce(DAYTIME);

      const sql = h.claimSql();
      expect(sql).toContain("due.status IN ('pending', 'confirmed')");
      expect(sql).toContain('due.starts_at >');
      expect(sql).toContain('co.reminder_hours_before');
      expect(sql).toContain('due.deleted_at IS NULL');
      expect(sql).toContain('cl.deleted_at IS NULL');
      expect(sql).toContain('co.deleted_at IS NULL');
    });

    it('caps each run and each session, and passes the retry cut-off', () => {
      const h = harness({
        REMINDERS_MAX_PER_RUN: '7',
        REMINDERS_MAX_ATTEMPTS: '2',
        REMINDERS_RETRY_MINUTES: '30',
      });
      void h.worker.runOnce(DAYTIME);

      const params = h.claimParams();
      expect(params).toContain(7); // LIMIT
      expect(params).toContain(2); // attempts cap
      // now - 30m, so a session tried in the last half hour is left alone.
      expect(params).toContainEqual(new Date('2026-09-06T05:30:00Z'));
      expect(params).toContainEqual(DAYTIME);
    });

    it('clamps absurd configuration instead of trusting it', () => {
      const h = harness({ REMINDERS_MAX_PER_RUN: '100000', REMINDERS_MAX_ATTEMPTS: '-4' });
      void h.worker.runOnce(DAYTIME);

      const params = h.claimParams();
      expect(params).toContain(500); // ceiling
      expect(params).toContain(1); // floor
    });

    it('stops early when nothing is due', async () => {
      const h = harness({}, []);

      expect(await h.worker.runOnce(DAYTIME)).toEqual({ claimed: 0, sent: 0, failed: 0 });
      expect(h.db.session.findMany).not.toHaveBeenCalled();
      expect(h.sms.sendText).not.toHaveBeenCalled();
    });
  });

  describe('the message', () => {
    it('sends the coach template with the real confirm link, in Israel time', async () => {
      const h = harness();
      await h.worker.runOnce(DAYTIME);

      const [phone, message] = h.sms.sendText.mock.calls[0] as [string, string];
      expect(phone).toBe('+972545551201');
      expect(message).toContain('רון'); // first name only
      expect(message).toContain('דנה'); // this client's coach
      expect(message).not.toContain('אביב');
      expect(message).toContain('18:00'); // 15:00 UTC in Israel
      expect(message).toContain(
        'https://app.example.com/confirm/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
      expect(message).not.toContain('{'); // no unfilled placeholders
      expect(message).not.toContain('coach.link');
    });

    it("uses the coach's own wording when they customised it", async () => {
      const session = sessionRow();
      session.coach.templates = { reminder: 'אימון ב-{שעה}. לאישור: {קישור}' };
      const h = harness({}, [{ id: 'session-1', attempts: 1 }], [session]);

      await h.worker.runOnce(DAYTIME);

      expect(h.sms.sendText.mock.calls[0][1]).toBe(
        'אימון ב-18:00. לאישור: https://app.example.com/confirm/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      );
    });

    it('never writes "null" into a message when a session has no location', async () => {
      const h = harness({}, [{ id: 'session-1', attempts: 1 }], [sessionRow({ location: null })]);

      await h.worker.runOnce(DAYTIME);

      const message = h.sms.sendText.mock.calls[0][1] as string;
      expect(message).not.toContain('null');
      expect(message).not.toContain('undefined');
    });

    it('falls back to the shared default when the coach cleared their template', async () => {
      const session = sessionRow();
      session.coach.templates = { reminder: '' };
      const h = harness({}, [{ id: 'session-1', attempts: 1 }], [session]);

      await h.worker.runOnce(DAYTIME);

      expect(h.sms.sendText.mock.calls[0][1]).toContain('מזכיר לך את האימון');
    });
  });

  describe('failure handling', () => {
    it('leaves the session unsent so the retry window picks it up', async () => {
      const h = harness();
      h.sms.sendText.mockRejectedValue(new SmsSendError('019 responded 500'));

      expect(await h.worker.runOnce(DAYTIME)).toEqual({ claimed: 1, sent: 0, failed: 1 });
      expect(h.db.session.update).not.toHaveBeenCalled();
    });

    it('keeps going after one bad recipient', async () => {
      const rows = [
        { id: 'session-1', attempts: 1 },
        { id: 'session-2', attempts: 1 },
      ];
      const sessions = [sessionRow(), sessionRow({ id: 'session-2' })];
      const h = harness({}, rows, sessions);
      h.sms.sendText.mockRejectedValueOnce(new SmsSendError('rejected'));

      expect(await h.worker.runOnce(DAYTIME)).toEqual({ claimed: 2, sent: 1, failed: 1 });
      expect(h.db.session.update).toHaveBeenCalledTimes(1);
      expect(h.db.session.update.mock.calls[0][0].where.id).toBe('session-2');
    });

    it('does not spend money on an undialable number', async () => {
      const h = harness(
        {},
        [{ id: 'session-1', attempts: 1 }],
        [sessionRow({ client: { id: 'c', name: 'רון', phone: 'לא-טלפון' } })],
      );

      expect(await h.worker.runOnce(DAYTIME)).toEqual({ claimed: 1, sent: 0, failed: 1 });
      expect(h.sms.sendText).not.toHaveBeenCalled();
      expect(h.db.session.update).not.toHaveBeenCalled();
    });

    it('swallows a crashing run so the timer survives it', async () => {
      const h = harness();
      h.db.$queryRaw.mockRejectedValue(new Error('connection terminated'));

      await expect(h.worker.tick()).resolves.toBeUndefined();
    });
  });

  describe('scheduling', () => {
    it('never runs two passes at once', async () => {
      const h = harness();
      let release: () => void = () => {};
      h.db.$queryRaw.mockImplementation(
        () => new Promise((resolve) => (release = () => resolve([]))),
      );

      const first = h.worker.tick();
      const second = await h.worker.tick(); // while the first is still in flight
      expect(second).toBeUndefined();

      release();
      await first;
      expect(h.db.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('stops ticking after shutdown', () => {
      const h = harness();
      const clear = vi.spyOn(globalThis, 'clearInterval');

      h.worker.onApplicationBootstrap();
      h.worker.onApplicationShutdown();

      expect(clear).toHaveBeenCalled();
      clear.mockRestore();
    });
  });
});

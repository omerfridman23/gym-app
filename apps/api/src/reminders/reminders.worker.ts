import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SMS_PROVIDER, type SmsProvider } from '../auth/sms/sms-provider.js';
import { toProfile } from '../coaches/coaches.service.js';
import { PrismaAdminService } from '../database/prisma-admin.service.js';
import {
  DEFAULT_REMINDER_TEMPLATE,
  fillTemplate,
  inQuietHours,
  israelTime,
  reminderVars,
  resolveWebOrigin,
  toE164Israel,
} from './reminders.template.js';

/**
 * Sends session reminders by SMS, `reminderHoursBefore` hours before each
 * session, with the client's own confirm link.
 *
 * Runs inside the API process on a timer — no external scheduler needed. It is
 * the only writer that crosses coach boundaries, so it uses the privileged
 * client (RLS is per-coach and there is no coach in context here) and is
 * therefore careful to filter by `deleted_at` itself.
 *
 * Safety properties, in order of how much they'd cost to get wrong:
 * - **No double sends.** A session is claimed with a single atomic UPDATE
 *   before the SMS goes out, so a second API instance (or an overlapping run)
 *   cannot pick it up. SMS costs money and clients notice duplicates.
 * - **Bounded retries.** A failed send is retried after `retryMinutes`, at
 *   most `maxAttempts` times, so a wrong phone number or a gateway outage
 *   can't turn into an infinite paid loop.
 * - **Off unless asked.** Disabled by default; enabling it is an explicit,
 *   documented decision because every run can spend money.
 * - **No 3am texts.** Sends pause during quiet hours (Israel local time).
 */

export interface RemindersRunSummary {
  claimed: number;
  sent: number;
  failed: number;
  /** Set when the run did nothing on purpose. */
  skipped?: 'disabled' | 'quiet-hours';
}

interface ClaimedRow {
  id: string;
  attempts: number;
}

const DEFAULTS = {
  pollSeconds: 300,
  maxPerRun: 50,
  maxAttempts: 3,
  retryMinutes: 15,
  quietStartHour: 22,
  quietEndHour: 8,
};

function readInt(
  config: ConfigService,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = config.get<string>(key);
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function readBool(config: ConfigService, key: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(config.get(key) ?? '').trim().toLowerCase());
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class RemindersWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('RemindersWorker');
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  readonly enabled: boolean;
  private readonly pollSeconds: number;
  private readonly maxPerRun: number;
  private readonly maxAttempts: number;
  private readonly retryMinutes: number;
  private readonly quietStartHour: number;
  private readonly quietEndHour: number;
  private readonly webOrigin: string;

  constructor(
    private readonly db: PrismaAdminService,
    private readonly config: ConfigService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {
    this.enabled = readBool(config, 'REMINDERS_ENABLED');
    this.pollSeconds = readInt(config, 'REMINDERS_POLL_SECONDS', DEFAULTS.pollSeconds, 30, 3600);
    this.maxPerRun = readInt(config, 'REMINDERS_MAX_PER_RUN', DEFAULTS.maxPerRun, 1, 500);
    this.maxAttempts = readInt(config, 'REMINDERS_MAX_ATTEMPTS', DEFAULTS.maxAttempts, 1, 10);
    this.retryMinutes = readInt(config, 'REMINDERS_RETRY_MINUTES', DEFAULTS.retryMinutes, 1, 1440);
    this.quietStartHour = readInt(config, 'REMINDERS_QUIET_START_HOUR', DEFAULTS.quietStartHour, 0, 23);
    this.quietEndHour = readInt(config, 'REMINDERS_QUIET_END_HOUR', DEFAULTS.quietEndHour, 0, 23);
    this.webOrigin = resolveWebOrigin(
      config.get<string>('PUBLIC_WEB_URL'),
      config.get<string>('WEB_ORIGIN'),
    );
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('Automatic SMS reminders are off (set REMINDERS_ENABLED=true to enable)');
      return;
    }

    const driver = String(this.config.get('SMS_DRIVER') ?? '').toLowerCase();
    if (driver === 'dev' || (driver === '' && this.config.get('NODE_ENV') !== 'production')) {
      this.logger.warn('Reminders are on with the dev SMS driver — messages are logged, not sent');
    }

    this.logger.log(
      `Automatic SMS reminders on: every ${this.pollSeconds}s, up to ${this.maxPerRun} per run, ` +
        `quiet ${this.quietStartHour}:00–${this.quietEndHour}:00 Israel time, links at ${this.webOrigin}`,
    );

    this.timer = setInterval(() => void this.tick(), this.pollSeconds * 1000);
    // Don't hold the event loop open; the HTTP server keeps the process alive.
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One scheduled pass. Never throws — a bad run must not kill the timer. */
  async tick(): Promise<RemindersRunSummary | undefined> {
    if (this.running) {
      this.logger.warn('Previous reminder run is still going; skipping this tick');
      return undefined;
    }

    this.running = true;
    try {
      return await this.runOnce();
    } catch (error) {
      this.logger.error(`Reminder run failed: ${reason(error)}`);
      return undefined;
    } finally {
      this.running = false;
    }
  }

  /** Claims every due reminder and sends it. Exposed for tests and one-offs. */
  async runOnce(now: Date = new Date()): Promise<RemindersRunSummary> {
    if (!this.enabled) return { claimed: 0, sent: 0, failed: 0, skipped: 'disabled' };

    if (inQuietHours(now, this.quietStartHour, this.quietEndHour)) {
      return { claimed: 0, sent: 0, failed: 0, skipped: 'quiet-hours' };
    }

    const claimed = await this.claimDue(now);
    if (claimed.length === 0) return { claimed: 0, sent: 0, failed: 0 };

    const attemptsById = new Map(claimed.map((row) => [row.id, row.attempts]));
    const sessions = await this.db.session.findMany({
      where: { id: { in: [...attemptsById.keys()] } },
      include: { client: true, coach: true },
      orderBy: { startsAt: 'asc' },
    });

    let sent = 0;
    let failed = 0;

    for (const session of sessions) {
      const attempt = attemptsById.get(session.id) ?? 1;
      const phone = toE164Israel(session.client.phone);

      if (!phone) {
        failed += 1;
        this.logger.error(
          `Session ${session.id}: client phone is not a dialable Israeli mobile, skipping`,
        );
        continue;
      }

      const template = toProfile(session.coach).templates.reminder || DEFAULT_REMINDER_TEMPLATE;
      const message = fillTemplate(
        template,
        reminderVars({
          clientName: session.client.name,
          coachName: session.coach.name,
          time: israelTime(session.startsAt),
          location: session.location,
          confirmUrl: `${this.webOrigin}/confirm/${session.confirmToken}`,
        }),
      );

      try {
        await this.sms.sendText(phone, message);
        // Only now is the reminder really done; until this lands the claim
        // keeps it out of other runs and the retry window brings it back.
        await this.db.session.update({
          where: { id: session.id },
          data: { reminderSent: true },
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        const retry =
          attempt >= this.maxAttempts ? 'giving up' : `retrying in ~${this.retryMinutes}m`;
        this.logger.error(
          `Session ${session.id}: reminder attempt ${attempt}/${this.maxAttempts} failed ` +
            `(${reason(error)}) — ${retry}`,
        );
      }
    }

    this.logger.log(`Reminders: claimed ${claimed.length}, sent ${sent}, failed ${failed}`);
    return { claimed: claimed.length, sent, failed };
  }

  /**
   * Atomically takes ownership of the reminders that are due now.
   *
   * The guard conditions are repeated in the outer WHERE on purpose: Postgres
   * re-evaluates it after taking the row lock, which is what makes two
   * concurrent workers mutually exclusive rather than merely unlikely to
   * collide. `SKIP LOCKED` means the loser moves on instead of blocking.
   */
  private claimDue(now: Date): Promise<ClaimedRow[]> {
    const retryBefore = new Date(now.getTime() - this.retryMinutes * 60_000);

    return this.db.$queryRaw<ClaimedRow[]>`
      UPDATE sessions s
         SET reminder_attempts = s.reminder_attempts + 1,
             reminder_last_attempt_at = ${now}
       WHERE s.reminder_sent = false
         AND s.deleted_at IS NULL
         AND s.reminder_attempts < ${this.maxAttempts}
         AND (s.reminder_last_attempt_at IS NULL OR s.reminder_last_attempt_at < ${retryBefore})
         AND s.id IN (
           SELECT due.id
             FROM sessions due
             JOIN coaches co ON co.id = due.coach_id
             JOIN clients cl ON cl.id = due.client_id
            WHERE due.reminder_sent = false
              AND due.deleted_at IS NULL
              AND due.status IN ('pending', 'confirmed')
              AND co.deleted_at IS NULL
              AND cl.deleted_at IS NULL
              AND due.reminder_attempts < ${this.maxAttempts}
              AND (due.reminder_last_attempt_at IS NULL
                   OR due.reminder_last_attempt_at < ${retryBefore})
              AND due.starts_at > ${now}
              AND due.starts_at <= ${now} + make_interval(hours => co.reminder_hours_before)
            ORDER BY due.starts_at
            LIMIT ${this.maxPerRun}
            FOR UPDATE OF due SKIP LOCKED
         )
      RETURNING s.id, s.reminder_attempts AS attempts
    `;
  }
}

-- Automatic reminder worker: per-session delivery bookkeeping.
--
-- `reminder_sent` alone cannot express "tried and failed". The worker claims a
-- session by stamping `reminder_last_attempt_at` and bumping
-- `reminder_attempts` in one atomic UPDATE, so two API instances can never
-- send the same reminder twice, a transient gateway error is retried after a
-- backoff window, and a permanently bad number stops after N attempts.

ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "reminder_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reminder_last_attempt_at" timestamptz(6);

-- The worker scans upcoming un-reminded sessions across all coaches every few
-- minutes. Partial index (Prisma cannot express these — kept in SQL like the
-- RLS policies and views) so that scan stays cheap as `sessions` grows.
CREATE INDEX IF NOT EXISTS "sessions_reminder_due_idx"
  ON "sessions" ("starts_at")
  WHERE "reminder_sent" = false AND "deleted_at" IS NULL;

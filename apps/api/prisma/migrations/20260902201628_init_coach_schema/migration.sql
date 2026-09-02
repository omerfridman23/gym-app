-- CreateEnum
CREATE TYPE "vertical" AS ENUM ('padel', 'fitness');

-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('pending', 'confirmed', 'cancelled', 'done');

-- CreateEnum
CREATE TYPE "attendance" AS ENUM ('arrived', 'no_show');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('cash', 'bit', 'transfer', 'card');

-- CreateTable
CREATE TABLE "coaches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "vertical" "vertical",
    "default_price_agorot" INTEGER NOT NULL DEFAULT 0,
    "reminder_hours_before" INTEGER NOT NULL DEFAULT 24,
    "cancellation_policy" TEXT NOT NULL DEFAULT '',
    "templates" JSONB NOT NULL DEFAULT '{}',
    "onboarded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "coach_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '{}',
    "price_agorot" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "coach_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "type_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "time_local" TEXT NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "location" TEXT,
    "price_agorot" INTEGER NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "session_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "coach_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "series_id" UUID,
    "type_id" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "location" TEXT,
    "price_agorot" INTEGER NOT NULL,
    "status" "session_status" NOT NULL DEFAULT 'pending',
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "package_id" UUID,
    "reminder_sent" BOOLEAN NOT NULL DEFAULT false,
    "reminder_answered" BOOLEAN NOT NULL DEFAULT false,
    "attendance" "attendance",
    "cancel_reason" TEXT,
    "confirm_token" UUID NOT NULL DEFAULT gen_random_uuid(),
    "confirm_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "coach_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "total_sessions" INTEGER NOT NULL,
    "purchased_agorot" INTEGER NOT NULL,
    "purchased_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "coach_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "amount_agorot" INTEGER NOT NULL,
    "method" "payment_method" NOT NULL,
    "paid_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coaches_phone_key" ON "coaches"("phone");

-- CreateIndex
CREATE INDEX "clients_coach_id_idx" ON "clients"("coach_id");

-- CreateIndex
CREATE INDEX "session_series_coach_id_idx" ON "session_series"("coach_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_confirm_token_key" ON "sessions"("confirm_token");

-- CreateIndex
CREATE INDEX "sessions_coach_id_starts_at_idx" ON "sessions"("coach_id", "starts_at");

-- CreateIndex
CREATE INDEX "sessions_client_id_idx" ON "sessions"("client_id");

-- CreateIndex
CREATE INDEX "packages_coach_id_idx" ON "packages"("coach_id");

-- CreateIndex
CREATE INDEX "payments_coach_id_idx" ON "payments"("coach_id");

-- CreateIndex
CREATE INDEX "payments_client_id_idx" ON "payments"("client_id");

-- CreateIndex
CREATE INDEX "otp_codes_phone_idx" ON "otp_codes"("phone");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_series" ADD CONSTRAINT "session_series_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_series" ADD CONSTRAINT "session_series_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "session_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Hand-written section (not expressible in schema.prisma — see docs/SPEC.md):
-- application role, row-level security, and calculated views.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Application role.
-- The API connects as app_user at runtime. Created via SQL (NOT the Neon
-- console/API) so it is a plain role without neon_superuser/BYPASSRLS.
-- LOGIN + password are granted outside the repo (no secrets in migrations).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA "public" TO app_user;

-- No DELETE grant anywhere: hard deletes are impossible for the API role.
-- Soft delete = UPDATE ... SET deleted_at.
GRANT SELECT, INSERT, UPDATE ON "coaches", "clients", "sessions", "session_series", "packages", "payments" TO app_user;
-- otp_codes intentionally gets no grants: it is pre-auth data handled only by
-- the privileged auth client (table owner).

-- ---------------------------------------------------------------------------
-- Row-level security. Every table, no exceptions (handoff section 5).
-- The API sets `app.coach_id` per transaction (SET LOCAL); when it is unset,
-- current_setting(..., true) yields NULL and every policy denies by default.
-- The table owner (migrations, auth service client) is exempt by design.
-- ---------------------------------------------------------------------------
ALTER TABLE "coaches" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coaches_self_isolation" ON "coaches"
  USING ("id" = current_setting('app.coach_id', true)::uuid)
  WITH CHECK ("id" = current_setting('app.coach_id', true)::uuid);

ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_coach_isolation" ON "clients"
  USING ("coach_id" = current_setting('app.coach_id', true)::uuid)
  WITH CHECK ("coach_id" = current_setting('app.coach_id', true)::uuid);

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_coach_isolation" ON "sessions"
  USING ("coach_id" = current_setting('app.coach_id', true)::uuid)
  WITH CHECK ("coach_id" = current_setting('app.coach_id', true)::uuid);

ALTER TABLE "session_series" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session_series_coach_isolation" ON "session_series"
  USING ("coach_id" = current_setting('app.coach_id', true)::uuid)
  WITH CHECK ("coach_id" = current_setting('app.coach_id', true)::uuid);

ALTER TABLE "packages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages_coach_isolation" ON "packages"
  USING ("coach_id" = current_setting('app.coach_id', true)::uuid)
  WITH CHECK ("coach_id" = current_setting('app.coach_id', true)::uuid);

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_coach_isolation" ON "payments"
  USING ("coach_id" = current_setting('app.coach_id', true)::uuid)
  WITH CHECK ("coach_id" = current_setting('app.coach_id', true)::uuid);

-- RLS enabled with no policies = deny-all for app_user (owner-only table).
ALTER TABLE "otp_codes" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Calculated views. security_invoker makes the views respect the RLS of the
-- querying role (without it, views execute with owner rights and would leak
-- rows across coaches).
--
-- Debt is calculated, never stored (handoff section 5):
--   debt = completed chargeable sessions − payments
-- ---------------------------------------------------------------------------
CREATE VIEW "client_debt" WITH (security_invoker = true) AS
SELECT
  c."id" AS "client_id",
  c."coach_id",
  (COALESCE(s."charged_agorot", 0) - COALESCE(p."paid_agorot", 0))::int AS "debt_agorot",
  COALESCE(s."unpaid_sessions", 0)::int AS "unpaid_sessions",
  s."last_unpaid_at"
FROM "clients" c
LEFT JOIN (
  SELECT
    "client_id",
    SUM("price_agorot") AS "charged_agorot",
    COUNT(*) FILTER (WHERE NOT "paid") AS "unpaid_sessions",
    MAX("starts_at") FILTER (WHERE NOT "paid") AS "last_unpaid_at"
  FROM "sessions"
  WHERE "status" = 'done'
    AND "package_id" IS NULL
    AND "price_agorot" > 0
    AND "deleted_at" IS NULL
  GROUP BY "client_id"
) s ON s."client_id" = c."id"
LEFT JOIN (
  SELECT "client_id", SUM("amount_agorot") AS "paid_agorot"
  FROM "payments"
  WHERE "deleted_at" IS NULL
  GROUP BY "client_id"
) p ON p."client_id" = c."id"
WHERE c."deleted_at" IS NULL;

-- Package balance is calculated the same way: remaining = total − used.
CREATE VIEW "package_balance" WITH (security_invoker = true) AS
SELECT
  p."id" AS "package_id",
  p."coach_id",
  p."client_id",
  p."total_sessions",
  (p."total_sessions" - COUNT(s."id") FILTER (WHERE s."status" <> 'cancelled'))::int AS "remaining_sessions"
FROM "packages" p
LEFT JOIN "sessions" s
  ON s."package_id" = p."id"
 AND s."deleted_at" IS NULL
WHERE p."deleted_at" IS NULL
GROUP BY p."id";

GRANT SELECT ON "client_debt", "package_balance" TO app_user;

-- Public self-booking ("Calendly for coaches"): a coach picks a slug and the
-- app serves a public /book/:slug page where clients grab a free slot
-- themselves. The page derives availability from the coach's local work-hour
-- window (booking_start_hour..booking_end_hour, Asia/Jerusalem) minus the
-- sessions already on the calendar.
--
-- Lookups by slug happen pre-auth (no coach session), so they go through the
-- privileged client like the other public token links; the existing
-- table-level grants and RLS policies on "coaches" already cover the new
-- columns for the app_user role.

ALTER TABLE "coaches"
  ADD COLUMN IF NOT EXISTS "booking_slug" TEXT,
  ADD COLUMN IF NOT EXISTS "booking_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "booking_start_hour" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "booking_end_hour" INTEGER NOT NULL DEFAULT 21;

-- One slug, one coach — the slug is the public identity of the booking page.
CREATE UNIQUE INDEX IF NOT EXISTS "coaches_booking_slug_key" ON "coaches"("booking_slug");

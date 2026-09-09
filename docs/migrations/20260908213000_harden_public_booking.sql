-- Normalize client phones for indexed lookup and enforce public-booking
-- settings at the database boundary. Existing duplicate phones are preserved;
-- application-level advisory locks prevent new public-booking duplicates.

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "normalized_phone" TEXT;

UPDATE "clients"
SET "normalized_phone" =
  CASE
    WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^009725[0-9]{8}$'
      THEN '+' || substring(regexp_replace("phone", '[^0-9]', '', 'g') FROM 3)
    WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^9725[0-9]{8}$'
      THEN '+' || regexp_replace("phone", '[^0-9]', '', 'g')
    WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^05[0-9]{8}$'
      THEN '+972' || substring(regexp_replace("phone", '[^0-9]', '', 'g') FROM 2)
    ELSE NULL
  END
WHERE "normalized_phone" IS NULL;

CREATE INDEX IF NOT EXISTS "clients_coach_id_normalized_phone_idx"
  ON "clients" ("coach_id", "normalized_phone");

ALTER TABLE "coaches"
  ADD CONSTRAINT "coaches_booking_hours_check"
    CHECK (
      "booking_start_hour" >= 0
      AND "booking_start_hour" < "booking_end_hour"
      AND "booking_end_hour" <= 24
    ),
  ADD CONSTRAINT "coaches_booking_slug_format_check"
    CHECK (
      "booking_slug" IS NULL
      OR "booking_slug" ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'
    ),
  ADD CONSTRAINT "coaches_booking_enabled_slug_check"
    CHECK (NOT "booking_enabled" OR "booking_slug" IS NOT NULL);

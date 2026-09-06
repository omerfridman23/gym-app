-- App-wide settings (Twilio credentials, etc.). Owner-only like otp_codes.
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;

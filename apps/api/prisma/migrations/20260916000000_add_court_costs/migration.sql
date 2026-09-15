ALTER TABLE "coaches"
  ADD COLUMN "default_court_cost_agorot" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "session_series"
  ADD COLUMN "court_cost_agorot" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "sessions"
  ADD COLUMN "court_cost_agorot" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "coaches"
  ADD CONSTRAINT "coaches_default_court_cost_nonnegative"
  CHECK ("default_court_cost_agorot" >= 0);

ALTER TABLE "session_series"
  ADD CONSTRAINT "session_series_court_cost_nonnegative"
  CHECK ("court_cost_agorot" >= 0);

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_court_cost_nonnegative"
  CHECK ("court_cost_agorot" >= 0);

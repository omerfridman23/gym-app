-- Fix: RLS policies crashed instead of denying when no coach context was set.
--
-- `set_config('app.coach_id', ..., true)` registers a session-level placeholder
-- for the custom GUC. Once that happens, the GUC's reset value is the empty
-- string rather than NULL, so after the first scoped transaction ends every
-- later unscoped query evaluated `''::uuid` and raised
-- "invalid input syntax for type uuid" instead of matching zero rows.
--
-- Wrapping the lookup in NULLIF restores the intended deny-by-default: no
-- coach context yields NULL, and `coach_id = NULL` is never true.

CREATE OR REPLACE FUNCTION "current_coach_id"()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULLIF(current_setting('app.coach_id', true), '')::uuid $$;

GRANT EXECUTE ON FUNCTION "current_coach_id"() TO app_user;

DROP POLICY IF EXISTS "coaches_self_isolation" ON "coaches";
CREATE POLICY "coaches_self_isolation" ON "coaches"
  USING ("id" = "current_coach_id"())
  WITH CHECK ("id" = "current_coach_id"());

DROP POLICY IF EXISTS "clients_coach_isolation" ON "clients";
CREATE POLICY "clients_coach_isolation" ON "clients"
  USING ("coach_id" = "current_coach_id"())
  WITH CHECK ("coach_id" = "current_coach_id"());

DROP POLICY IF EXISTS "sessions_coach_isolation" ON "sessions";
CREATE POLICY "sessions_coach_isolation" ON "sessions"
  USING ("coach_id" = "current_coach_id"())
  WITH CHECK ("coach_id" = "current_coach_id"());

DROP POLICY IF EXISTS "session_series_coach_isolation" ON "session_series";
CREATE POLICY "session_series_coach_isolation" ON "session_series"
  USING ("coach_id" = "current_coach_id"())
  WITH CHECK ("coach_id" = "current_coach_id"());

DROP POLICY IF EXISTS "packages_coach_isolation" ON "packages";
CREATE POLICY "packages_coach_isolation" ON "packages"
  USING ("coach_id" = "current_coach_id"())
  WITH CHECK ("coach_id" = "current_coach_id"());

DROP POLICY IF EXISTS "payments_coach_isolation" ON "payments";
CREATE POLICY "payments_coach_isolation" ON "payments"
  USING ("coach_id" = "current_coach_id"())
  WITH CHECK ("coach_id" = "current_coach_id"());

-- Hand-authored: triggers cannot come from the Drizzle schema (ADR-0027).
-- 0019's trigger blocked every UPDATE, including the author re-point an estate
-- account merge must perform (ADR-0025), so a merge could never complete.
DROP TRIGGER IF EXISTS incident_log_no_update;
--> statement-breakpoint
-- Scoped to the content columns: what was written stays immutable, while who
-- the row points at remains estate bookkeeping.
CREATE TRIGGER incident_log_no_update
BEFORE UPDATE OF body, performance_id, supersedes_id, created_at ON incident_log
BEGIN
  SELECT RAISE(ABORT, 'incident_log is append-only: correct it with a new entry');
END;

-- Hand-authored: triggers cannot come from the Drizzle schema (ADR-0027).
-- Scoped to the content columns, so an estate account merge can still
-- re-point checked_by_user_id (ADR-0025). See migration 0023 for why.
CREATE TRIGGER age_checks_no_update
BEFORE UPDATE OF outcome, reason, product_description, description, notes, performance_id, supersedes_id, checked_at ON age_checks
BEGIN
  SELECT RAISE(ABORT, 'age_checks is append-only: correct it with a new entry');
END;
--> statement-breakpoint
CREATE TRIGGER age_checks_no_delete
BEFORE DELETE ON age_checks
BEGIN
  SELECT RAISE(ABORT, 'age_checks is append-only: correct it with a new entry');
END;

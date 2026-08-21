-- Hand-authored: a trigger cannot be expressed in the Drizzle schema (ADR-0027).
-- The incident log is a safety record; one you can tidy is not a record.
CREATE TRIGGER incident_log_no_update
BEFORE UPDATE ON incident_log
BEGIN
  SELECT RAISE(ABORT, 'incident_log is append-only: correct it with a new entry');
END;
--> statement-breakpoint
CREATE TRIGGER incident_log_no_delete
BEFORE DELETE ON incident_log
BEGIN
  SELECT RAISE(ABORT, 'incident_log is append-only: correct it with a new entry');
END;

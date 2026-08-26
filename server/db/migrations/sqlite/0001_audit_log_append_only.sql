-- Append-only is trigger-enforced, not a convention (decision 0010). The audit trail carries no
-- personal free text, so erasure never needs to reach into it and never needs to update a row
-- (decision 0011).

CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only: correct by writing a superseding entry');
END;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only: correct by writing a superseding entry');
END;

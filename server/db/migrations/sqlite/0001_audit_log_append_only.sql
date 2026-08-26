-- Append-only is trigger-enforced, not a convention (decision 0010). Rows may never be deleted,
-- and no field may be rewritten except `detail`, which erasure redacts when an entry has picked
-- up identifying values (decision 0011). A correction supersedes with a new entry.

CREATE TRIGGER audit_log_redaction_only
BEFORE UPDATE ON audit_log
WHEN OLD.id IS NOT NEW.id
  OR OLD.actor_id IS NOT NEW.actor_id
  OR OLD.action IS NOT NEW.action
  OR OLD.target IS NOT NEW.target
  OR OLD.created_at IS NOT NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only: only detail may be redacted, and a correction supersedes with a new entry');
END;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only: a correction supersedes with a new entry');
END;

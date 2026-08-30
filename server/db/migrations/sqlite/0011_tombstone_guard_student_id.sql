-- The guard names identifying columns one by one, so a column added later is not covered until
-- it is named. `student_id` is how the committee finds somebody (0031), so it is one of them.

DROP TRIGGER IF EXISTS users_tombstone_guard;
--> statement-breakpoint
CREATE TRIGGER users_tombstone_guard
BEFORE UPDATE ON users
WHEN OLD.anonymised_at IS NOT NULL
  AND (OLD.email IS NOT NEW.email
    OR OLD.name IS NOT NEW.name
    OR OLD.pronouns IS NOT NEW.pronouns
    OR OLD.password IS NOT NEW.password
    OR OLD.google_sub IS NOT NEW.google_sub
    OR OLD.pending_google_email IS NOT NEW.pending_google_email
    OR OLD.student_id IS NOT NEW.student_id
    OR OLD.anonymised_at IS NOT NEW.anonymised_at)
BEGIN
  SELECT RAISE(ABORT, 'this account is anonymised: erasure is final and nothing may be written back over it');
END;

-- An anonymised row is never written back over (0011, A-125 criterion 3, K-109 criterion 3). A
-- guard in a handler is a guard one handler can forget, so it lives where every writer meets it.
-- The identifying columns only: a tombstone still records that it was disabled, and erasure itself
-- sets anonymised_at on a row where it is still NULL, so this never fires on the erasure.

CREATE TRIGGER users_tombstone_guard
BEFORE UPDATE ON users
WHEN OLD.anonymised_at IS NOT NULL
  AND (OLD.email IS NOT NEW.email
    OR OLD.name IS NOT NEW.name
    OR OLD.pronouns IS NOT NEW.pronouns
    OR OLD.password IS NOT NEW.password
    OR OLD.google_sub IS NOT NEW.google_sub
    OR OLD.pending_google_email IS NOT NEW.pending_google_email
    OR OLD.anonymised_at IS NOT NEW.anonymised_at)
BEGIN
  SELECT RAISE(ABORT, 'this account is anonymised: erasure is final and nothing may be written back over it');
END;

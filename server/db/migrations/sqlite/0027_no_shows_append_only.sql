-- Append-only is trigger-enforced, not a convention (decision 0010). A no-show is a fact about a
-- night: correcting one is a superseding WITHDRAWN entry naming what it supersedes, never an edit,
-- so the count a member is judged on can always be reconstructed (C-116 criterion 2).

CREATE TRIGGER room_no_shows_no_update
BEFORE UPDATE ON room_no_shows
BEGIN
  SELECT RAISE(ABORT, 'room_no_shows is append-only: add a WITHDRAWN entry that supersedes this one');
END;
--> statement-breakpoint
CREATE TRIGGER room_no_shows_no_delete
BEFORE DELETE ON room_no_shows
BEGIN
  SELECT RAISE(ABORT, 'room_no_shows is append-only: add a WITHDRAWN entry that supersedes this one');
END;

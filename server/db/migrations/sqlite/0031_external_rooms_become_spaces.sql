-- An SU room is not a room we can promise, so it leaves the bookable estate (C-120). The id is
-- reused, so anything still naming the old room is recognisable when it is reconciled by hand.

INSERT INTO external_spaces (id, name, campus, building, contact, capacity, is_active, created_at, updated_at)
SELECT id, name, campus, building, contact, capacity, is_active, created_at, updated_at
FROM rooms WHERE is_external = 1 AND id NOT IN (SELECT id FROM external_spaces);
--> statement-breakpoint
-- Deactivated rather than deleted: a booking made two years ago still names something, and a
-- deactivated room already leaves every member-facing calendar and form (C-101 criterion 2).
UPDATE rooms SET is_active = 0, updated_at = unixepoch() WHERE is_external = 1;

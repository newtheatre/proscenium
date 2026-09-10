CREATE TABLE `reservation_reinstatements` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`reason` text NOT NULL,
	`previous_status` text NOT NULL,
	`previous_hold_expires_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reservation_reinstatements_previous_status_values" CHECK("reservation_reinstatements"."previous_status" IN ('EXPIRED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE INDEX `reservation_reinstatements_reservation` ON `reservation_reinstatements` (`reservation_id`);--> statement-breakpoint
-- Append-only is trigger-enforced, not a convention (decision 0010). A correction is a further
-- row, never an edit to this one: it is the record that reinstating happened.
CREATE TRIGGER reservation_reinstatements_no_update
BEFORE UPDATE ON reservation_reinstatements
BEGIN
  SELECT RAISE(ABORT, 'reservation_reinstatements is append-only: it is the record that reinstating happened');
END;
--> statement-breakpoint
CREATE TRIGGER reservation_reinstatements_no_delete
BEFORE DELETE ON reservation_reinstatements
BEGIN
  SELECT RAISE(ABORT, 'reservation_reinstatements is append-only: it is the record that reinstating happened');
END;
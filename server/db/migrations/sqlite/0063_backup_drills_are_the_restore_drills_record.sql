CREATE TABLE `backup_drills` (
	`id` text PRIMARY KEY NOT NULL,
	`ran_on` text NOT NULL,
	`operator_id` text NOT NULL,
	`outcome` text NOT NULL,
	`time_to_restore_minutes` integer NOT NULL,
	`row_counts_match` integer NOT NULL,
	`money_totals_match` integer NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "backup_drills_outcome_values" CHECK("backup_drills"."outcome" IN ('PASS', 'FAIL')),
	CONSTRAINT "backup_drills_time_positive" CHECK("backup_drills"."time_to_restore_minutes" > 0)
);
--> statement-breakpoint
CREATE INDEX `backup_drills_ran_on` ON `backup_drills` (`ran_on`);
--> statement-breakpoint
-- Append-only is trigger-enforced (0010): a wrong figure is superseded by a further drill, never
-- corrected in place.
CREATE TRIGGER backup_drills_no_update
BEFORE UPDATE ON backup_drills
BEGIN
  SELECT RAISE(ABORT, 'backup_drills is append-only: record a further drill rather than editing this one');
END;
--> statement-breakpoint
CREATE TRIGGER backup_drills_no_delete
BEFORE DELETE ON backup_drills
BEGIN
  SELECT RAISE(ABORT, 'backup_drills is append-only: record a further drill rather than deleting this one');
END;

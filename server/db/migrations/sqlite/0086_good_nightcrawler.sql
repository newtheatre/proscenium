CREATE TABLE `z_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`night` text NOT NULL,
	`reader_pence` integer NOT NULL,
	`expected_pence` integer NOT NULL,
	`variance_pence` integer NOT NULL,
	`entered_by` text NOT NULL,
	`note` text,
	`supersedes_id` text,
	`written_off` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`entered_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "z_readings_variance_is_the_difference" CHECK("z_readings"."variance_pence" = "z_readings"."reader_pence" - "z_readings"."expected_pence"),
	CONSTRAINT "z_readings_variance_has_a_note" CHECK("z_readings"."variance_pence" = 0 OR "z_readings"."note" IS NOT NULL),
	CONSTRAINT "z_readings_write_off_resolves_a_variance" CHECK("z_readings"."written_off" = 0 OR ("z_readings"."variance_pence" <> 0 AND "z_readings"."supersedes_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `z_readings_night` ON `z_readings` (`night`);--> statement-breakpoint
CREATE UNIQUE INDEX `z_readings_one_root_per_night` ON `z_readings` (`night`) WHERE "z_readings"."supersedes_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `z_readings_supersedes_once` ON `z_readings` (`supersedes_id`) WHERE "z_readings"."supersedes_id" IS NOT NULL;
--> statement-breakpoint
-- Append-only is trigger-enforced, not a convention (decision 0010). A correction or a write-off
-- is a new row naming the one it resolves; nothing here may ever be rewritten or removed.

CREATE TRIGGER z_readings_no_update
BEFORE UPDATE ON z_readings
BEGIN
  SELECT RAISE(ABORT, 'z_readings is append-only: post a new reading that supersedes this one');
END;
--> statement-breakpoint
CREATE TRIGGER z_readings_no_delete
BEFORE DELETE ON z_readings
BEGIN
  SELECT RAISE(ABORT, 'z_readings is append-only: post a new reading that supersedes this one');
END;
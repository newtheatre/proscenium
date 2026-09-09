PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_venue_emergency_info` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`assembly_point` text,
	`exits` text,
	`isolation_points` text,
	`what3words` text,
	`notes` text,
	`updated_by` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
-- Hand-corrected: the old table has no `id` column (its PK was `venue_id`), and drizzle-kit's
-- diff read the new PK as something to copy rather than to invent (0010).
INSERT INTO `__new_venue_emergency_info`("id", "venue_id", "assembly_point", "exits", "isolation_points", "what3words", "notes", "updated_by", "updated_at") SELECT lower(hex(randomblob(16))), "venue_id", "assembly_point", "exits", "isolation_points", "what3words", "notes", "updated_by", "updated_at" FROM `venue_emergency_info`;--> statement-breakpoint
DROP TABLE `venue_emergency_info`;--> statement-breakpoint
ALTER TABLE `__new_venue_emergency_info` RENAME TO `venue_emergency_info`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `venue_emergency_info_venue_created` ON `venue_emergency_info` (`venue_id`,`updated_at`);--> statement-breakpoint
-- Append-only is trigger-enforced, not a convention (decision 0010). A correction is a new
-- version, never an edit to the last one (E-113 criterion 1).
CREATE TRIGGER venue_emergency_info_no_update
BEFORE UPDATE ON venue_emergency_info
BEGIN
  SELECT RAISE(ABORT, 'venue_emergency_info is append-only: add a new version instead');
END;
--> statement-breakpoint
CREATE TRIGGER venue_emergency_info_no_delete
BEFORE DELETE ON venue_emergency_info
BEGIN
  SELECT RAISE(ABORT, 'venue_emergency_info is append-only: add a new version instead');
END;
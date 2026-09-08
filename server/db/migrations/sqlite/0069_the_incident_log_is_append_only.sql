CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`reported_by` text NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`body` text NOT NULL,
	`happened_at` integer DEFAULT (unixepoch()) NOT NULL,
	`supersedes_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reported_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supersedes_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "incidents_category_values" CHECK("incidents"."category" IN ('MEDICAL', 'BEHAVIOUR', 'SAFETY', 'SECURITY', 'PROPERTY', 'OTHER')),
	CONSTRAINT "incidents_severity_values" CHECK("incidents"."severity" IN ('NOTE', 'NEAR_MISS', 'INCIDENT', 'SERIOUS')),
	CONSTRAINT "incidents_no_self_supersede" CHECK("incidents"."supersedes_id" IS NULL OR "incidents"."supersedes_id" <> "incidents"."id")
);
--> statement-breakpoint
CREATE INDEX `incidents_performance` ON `incidents` (`performance_id`);--> statement-breakpoint
CREATE INDEX `incidents_reported_by` ON `incidents` (`reported_by`);--> statement-breakpoint
CREATE INDEX `incidents_created_at` ON `incidents` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `incidents_one_correction` ON `incidents` (`supersedes_id`);--> statement-breakpoint
-- Append-only is trigger-enforced, not a convention (decision 0010). The safety record is defended
-- on paper: a correction is a new entry naming what it supersedes, never an edit to it (E-115 criterion 3).
CREATE TRIGGER incidents_no_update
BEFORE UPDATE ON incidents
BEGIN
  SELECT RAISE(ABORT, 'incidents is append-only: add a correcting entry that supersedes this one');
END;
--> statement-breakpoint
CREATE TRIGGER incidents_no_delete
BEFORE DELETE ON incidents
BEGIN
  SELECT RAISE(ABORT, 'incidents is append-only: add a correcting entry that supersedes this one');
END;
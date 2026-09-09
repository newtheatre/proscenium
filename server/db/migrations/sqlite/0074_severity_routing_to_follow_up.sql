CREATE TABLE `incident_followup_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`resolution_note` text NOT NULL,
	`closed_by` text NOT NULL,
	`closed_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `incident_followup_closures_incident` ON `incident_followup_closures` (`incident_id`);--> statement-breakpoint
CREATE TABLE `incident_severity_config` (
	`severity` text PRIMARY KEY NOT NULL,
	`requires_follow_up` integer DEFAULT false NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "incident_severity_config_values" CHECK("incident_severity_config"."severity" IN ('NOTE', 'NEAR_MISS', 'INCIDENT', 'SERIOUS'))
);
--> statement-breakpoint
-- Every severity seeded closed: nobody is routed until a committee member opts one in
-- (criterion 1), never guessed (0019).
INSERT INTO incident_severity_config (severity) VALUES ('NOTE'), ('NEAR_MISS'), ('INCIDENT'), ('SERIOUS');
--> statement-breakpoint
-- Append-only is trigger-enforced, not a convention (decision 0010). A closure is filed once and
-- never edited or withdrawn (E-116 criterion 3).
CREATE TRIGGER incident_followup_closures_no_update
BEFORE UPDATE ON incident_followup_closures
BEGIN
  SELECT RAISE(ABORT, 'incident_followup_closures is append-only: nothing here is ever edited');
END;
--> statement-breakpoint
CREATE TRIGGER incident_followup_closures_no_delete
BEFORE DELETE ON incident_followup_closures
BEGIN
  SELECT RAISE(ABORT, 'incident_followup_closures is append-only: nothing here is ever edited');
END;

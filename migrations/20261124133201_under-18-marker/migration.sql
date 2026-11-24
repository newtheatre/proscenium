CREATE TABLE `core_age_markers` (
	`account_id` text PRIMARY KEY NOT NULL,
	`turns_18_on` text NOT NULL,
	`source` text NOT NULL,
	`recorded_by` text NOT NULL,
	`recorded_at` integer NOT NULL,
	CONSTRAINT "core_age_markers_date" CHECK("turns_18_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `core_age_markers_turns` ON `core_age_markers` (`turns_18_on`);
CREATE TABLE `core_run_presets` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`slots` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "core_run_presets_name_length" CHECK(length("name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE `core_performance_runs` ADD `interval_minutes` integer;--> statement-breakpoint
ALTER TABLE `core_performance_runs` ADD `external_booking_url` text;--> statement-breakpoint
ALTER TABLE `core_performances` ADD `interval_minutes` integer;--> statement-breakpoint
ALTER TABLE `core_productions` ADD `interval_minutes` integer;--> statement-breakpoint
ALTER TABLE `core_productions` ADD `doors_before_minutes` integer;--> statement-breakpoint
ALTER TABLE `core_productions` ADD `capacity` integer;--> statement-breakpoint
ALTER TABLE `core_spaces` ADD `doors_before_minutes` integer;--> statement-breakpoint
ALTER TABLE `core_spaces` ADD `run_preset_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `core_run_presets_name` ON `core_run_presets` (lower("name"));
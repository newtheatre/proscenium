CREATE TABLE `box_office_run_layouts` (
	`id` text PRIMARY KEY,
	`production_id` text NOT NULL,
	`layout_id` text,
	`wheelchair_spaces` integer,
	`seats_per_space` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "box_office_run_layouts_choice" CHECK(("layout_id" IS NOT NULL AND "wheelchair_spaces" IS NULL AND "seats_per_space" IS NULL) OR ("layout_id" IS NULL AND "wheelchair_spaces" >= 0 AND "seats_per_space" >= 0))
);
--> statement-breakpoint
ALTER TABLE `box_office_performance_sales` ADD `wheelchair_spaces` integer;--> statement-breakpoint
ALTER TABLE `box_office_performance_sales` ADD `seats_per_space` integer;--> statement-breakpoint
ALTER TABLE `box_office_performance_sales` ADD `layout_own` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_run_layouts_production` ON `box_office_run_layouts` (`production_id`);
CREATE TABLE `core_performance_line_ups` (
	`id` text PRIMARY KEY,
	`performance_id` text NOT NULL,
	`production_id` text,
	`name` text NOT NULL,
	`note` text,
	`starts_at` integer,
	`minutes` integer,
	`announced` integer DEFAULT true NOT NULL,
	`sort` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_core_performance_line_ups_performance_id_core_performances_id_fk` FOREIGN KEY (`performance_id`) REFERENCES `core_performances`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_performance_line_ups_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE SET NULL,
	CONSTRAINT "core_performance_line_ups_name" CHECK(length("name") BETWEEN 1 AND 120),
	CONSTRAINT "core_performance_line_ups_note" CHECK("note" IS NULL OR length("note") <= 200),
	CONSTRAINT "core_performance_line_ups_minutes" CHECK("minutes" IS NULL OR "minutes" BETWEEN 1 AND 600)
);
--> statement-breakpoint
ALTER TABLE `core_production_credits` ADD `performance_id` text REFERENCES core_performances(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `core_production_credits` ADD `line_up_id` text REFERENCES core_performance_line_ups(id) ON DELETE CASCADE;--> statement-breakpoint
CREATE INDEX `core_performance_line_ups_order` ON `core_performance_line_ups` (`performance_id`,`sort`);--> statement-breakpoint
CREATE INDEX `core_performance_line_ups_production` ON `core_performance_line_ups` (`production_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_performance_line_ups_once` ON `core_performance_line_ups` (`performance_id`,`production_id`) WHERE "core_performance_line_ups"."production_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `core_production_credits_performance` ON `core_production_credits` (`performance_id`) WHERE "core_production_credits"."performance_id" IS NOT NULL;
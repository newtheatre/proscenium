CREATE TABLE `core_performance_runs` (
	`id` text PRIMARY KEY,
	`production_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`space_id` text NOT NULL,
	`scheduled` integer NOT NULL,
	`capacity` integer,
	`interval_count` integer,
	`label` text,
	`items` text NOT NULL,
	`total` integer NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'running' NOT NULL,
	`stop_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_core_performance_runs_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE CASCADE,
	CONSTRAINT "core_performance_runs_state" CHECK("state" IN ('running', 'stopped', 'done', 'removing', 'removed')),
	CONSTRAINT "core_performance_runs_done" CHECK("done" BETWEEN 0 AND "total"),
	CONSTRAINT "core_performance_runs_stop" CHECK("stop_reason" IS NULL OR length("stop_reason") <= 300)
);
--> statement-breakpoint
ALTER TABLE `core_performances` ADD `run_id` text REFERENCES core_performance_runs(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `core_performance_runs_production` ON `core_performance_runs` (`production_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_performances_run` ON `core_performances` (`run_id`,`starts_at`) WHERE "core_performances"."run_id" IS NOT NULL;
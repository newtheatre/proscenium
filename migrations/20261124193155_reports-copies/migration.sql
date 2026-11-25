CREATE TABLE `reports_definitions` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`kind` text DEFAULT 'figures' NOT NULL,
	`based_on` text,
	`columns` text NOT NULL,
	`rows_by` text,
	`across_by` text,
	`filters` text,
	`scope_kind` text NOT NULL,
	`scope_id` text,
	`period_rule` text NOT NULL,
	`chart` text,
	`share_role` text,
	`made_by` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "reports_definitions_kind" CHECK("kind" IN ('figures', 'people')),
	CONSTRAINT "reports_definitions_state_values" CHECK("state" IN ('active', 'archived')),
	CONSTRAINT "reports_definitions_name" CHECK(length("name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE `reports_runs` (
	`id` text PRIMARY KEY,
	`definition_id` text,
	`report_key` text,
	`question` text NOT NULL,
	`requested_by` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`rows_count` integer,
	`unavailable` text DEFAULT '[]' NOT NULL,
	`headline` text,
	`file_id` text,
	`data_file_id` text,
	`failure` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_reports_runs_definition_id_reports_definitions_id_fk` FOREIGN KEY (`definition_id`) REFERENCES `reports_definitions`(`id`),
	CONSTRAINT "reports_runs_state_values" CHECK("state" IN ('queued', 'running', 'done', 'failed', 'expired', 'stale')),
	CONSTRAINT "reports_runs_one_report" CHECK(("definition_id" IS NULL) <> ("report_key" IS NULL)),
	CONSTRAINT "reports_runs_rows" CHECK("rows_count" IS NULL OR "rows_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `reports_definitions_state` ON `reports_definitions` (`state`,`name`);--> statement-breakpoint
CREATE INDEX `reports_runs_requested` ON `reports_runs` (`requested_by`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_runs_state` ON `reports_runs` (`state`,`finished_at`);
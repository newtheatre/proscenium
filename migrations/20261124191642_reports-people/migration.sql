CREATE TABLE `reports_person_rows` (
	`id` text PRIMARY KEY,
	`run_id` text NOT NULL,
	`account_id` text NOT NULL,
	`measure` text NOT NULL,
	`breakdown_value` text,
	`value` integer NOT NULL,
	CONSTRAINT `fk_reports_person_rows_run_id_reports_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `reports_runs`(`id`),
	CONSTRAINT "reports_person_rows_value" CHECK("value" >= 0)
);
--> statement-breakpoint
CREATE INDEX `reports_person_rows_run` ON `reports_person_rows` (`run_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `reports_person_rows_account` ON `reports_person_rows` (`account_id`);
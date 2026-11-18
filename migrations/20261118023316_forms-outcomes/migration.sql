CREATE TABLE `forms_action_runs` (
	`id` text PRIMARY KEY,
	`response_id` text NOT NULL,
	`form_id` text NOT NULL,
	`move_key` text NOT NULL,
	`use_id` text NOT NULL,
	`action_key` text NOT NULL,
	`map` text NOT NULL,
	`revision` integer NOT NULL,
	`actor_id` text,
	`state` text DEFAULT 'waiting' NOT NULL,
	`detail` text,
	`job_id` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	CONSTRAINT `fk_forms_action_runs_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`),
	CONSTRAINT `fk_forms_action_runs_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`),
	CONSTRAINT "forms_action_runs_state" CHECK("state" IN ('waiting', 'done', 'skipped'))
);
--> statement-breakpoint
CREATE INDEX `forms_action_runs_response` ON `forms_action_runs` (`response_id`,`created_at`);
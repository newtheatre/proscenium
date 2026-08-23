CREATE TABLE `training_run_events` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `training_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `training_run_events_run_idx` ON `training_run_events` (`run_id`,`at`);--> statement-breakpoint
CREATE TABLE `training_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_key` text NOT NULL,
	`training_session_id` text,
	`started_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ended_at` integer,
	`ended_reason` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `training_runs_user_idx` ON `training_runs` (`user_id`,`ended_at`);--> statement-breakpoint
CREATE INDEX `training_runs_expires_idx` ON `training_runs` (`expires_at`);
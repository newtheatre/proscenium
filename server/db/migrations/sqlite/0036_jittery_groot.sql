CREATE TABLE `performance_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`night` text NOT NULL,
	`closed_by_user_id` text,
	`closed_at` text DEFAULT (current_timestamp) NOT NULL,
	`auto_closed` integer DEFAULT false NOT NULL,
	`closing_note` text,
	`checklist` text,
	`payload` text NOT NULL,
	`emailed_at` text,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`closed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `performance_reports_performance_unique` ON `performance_reports` (`performance_id`);--> statement-breakpoint
CREATE INDEX `performance_reports_night_idx` ON `performance_reports` (`night`);
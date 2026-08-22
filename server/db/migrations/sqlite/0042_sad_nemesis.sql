PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_performance_reports` (
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
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`closed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_performance_reports`("id", "performance_id", "night", "closed_by_user_id", "closed_at", "auto_closed", "closing_note", "checklist", "payload", "emailed_at") SELECT "id", "performance_id", "night", "closed_by_user_id", "closed_at", "auto_closed", "closing_note", "checklist", "payload", "emailed_at" FROM `performance_reports`;--> statement-breakpoint
DROP TABLE `performance_reports`;--> statement-breakpoint
ALTER TABLE `__new_performance_reports` RENAME TO `performance_reports`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `performance_reports_performance_unique` ON `performance_reports` (`performance_id`);--> statement-breakpoint
CREATE INDEX `performance_reports_night_idx` ON `performance_reports` (`night`);
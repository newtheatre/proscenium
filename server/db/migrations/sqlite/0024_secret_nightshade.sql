CREATE TABLE `age_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text,
	`checked_by_user_id` text NOT NULL,
	`outcome` text NOT NULL,
	`reason` text,
	`product_description` text,
	`description` text,
	`notes` text,
	`supersedes_id` text,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`checked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `age_checks_checked_at_idx` ON `age_checks` (`checked_at`);--> statement-breakpoint
CREATE INDEX `age_checks_performance_idx` ON `age_checks` (`performance_id`);
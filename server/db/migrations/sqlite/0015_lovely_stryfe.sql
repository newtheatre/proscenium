PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_pass_admissions` (
	`id` text PRIMARY KEY NOT NULL,
	`pass_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`redeemed_at` text DEFAULT (current_timestamp) NOT NULL,
	`redeemed_by_user_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`pass_id`) REFERENCES `passes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`redeemed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_pass_admissions`("id", "pass_id", "ticket_id", "performance_id", "redeemed_at", "redeemed_by_user_id", "created_at") SELECT "id", "pass_id", "ticket_id", "performance_id", "redeemed_at", "redeemed_by_user_id", "created_at" FROM `pass_admissions`;--> statement-breakpoint
DROP TABLE `pass_admissions`;--> statement-breakpoint
ALTER TABLE `__new_pass_admissions` RENAME TO `pass_admissions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `pass_admissions_ticket_unique` ON `pass_admissions` (`ticket_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pass_admissions_pass_performance_unique` ON `pass_admissions` (`pass_id`,`performance_id`);--> statement-breakpoint
CREATE INDEX `pass_admissions_pass_id_idx` ON `pass_admissions` (`pass_id`);--> statement-breakpoint
CREATE INDEX `pass_admissions_performance_id_idx` ON `pass_admissions` (`performance_id`);
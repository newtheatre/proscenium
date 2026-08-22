CREATE TABLE `pass_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`pass_type_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`quoted_pence` integer,
	`note` text,
	`requested_at` text DEFAULT (current_timestamp) NOT NULL,
	`decided_by_user_id` text,
	`decided_at` text,
	`pass_id` text,
	FOREIGN KEY (`pass_type_id`) REFERENCES `pass_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pass_id`) REFERENCES `passes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pass_requests_status_idx` ON `pass_requests` (`status`,`requested_at`);--> statement-breakpoint
CREATE INDEX `pass_requests_user_idx` ON `pass_requests` (`user_id`,`status`);
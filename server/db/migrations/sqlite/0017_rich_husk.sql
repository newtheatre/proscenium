CREATE TABLE `performance_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`role` text NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`needs_eligibility_review` integer DEFAULT false NOT NULL,
	`assigned_by_user_id` text,
	`claimed_at` text,
	`confirmed_at` text,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "performance_shifts_user_matches_status" CHECK((status = 'OPEN' and user_id is null) or (status <> 'OPEN' and user_id is not null))
);
--> statement-breakpoint
CREATE INDEX `performance_shifts_performance_id_idx` ON `performance_shifts` (`performance_id`);--> statement-breakpoint
CREATE INDEX `performance_shifts_user_id_idx` ON `performance_shifts` (`user_id`);--> statement-breakpoint
CREATE INDEX `performance_shifts_status_idx` ON `performance_shifts` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `performance_shifts_one_confirmed_dm` ON `performance_shifts` (`performance_id`) WHERE role = 'DUTY_MANAGER' and status = 'CONFIRMED';--> statement-breakpoint
CREATE TABLE `shift_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text,
	`role` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_templates_venue_role_unique` ON `shift_templates` (`venue_id`,`role`);
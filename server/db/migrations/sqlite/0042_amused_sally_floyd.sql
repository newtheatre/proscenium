CREATE TABLE `practice_target_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`target_key` text NOT NULL,
	`module_id` text NOT NULL,
	FOREIGN KEY (`target_key`) REFERENCES `practice_targets`(`key`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `practice_target_modules_module` ON `practice_target_modules` (`module_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `practice_target_modules_pair` ON `practice_target_modules` (`target_key`,`module_id`);--> statement-breakpoint
CREATE TABLE `practice_targets` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`window_hours` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "practice_targets_window_hours" CHECK("practice_targets"."window_hours" BETWEEN 1 AND 8760)
);
--> statement-breakpoint
CREATE INDEX `practice_targets_is_active` ON `practice_targets` (`is_active`);--> statement-breakpoint
CREATE TABLE `practice_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`target_key` text NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text,
	`opens_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`closed_at` integer,
	`closed_by` text,
	`opened_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`target_key`) REFERENCES `practice_targets`(`key`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`opened_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_windows_claim` ON `practice_windows` (`target_key`,`user_id`,`session_id`) WHERE session_id is not null;--> statement-breakpoint
CREATE INDEX `practice_windows_user` ON `practice_windows` (`user_id`);--> statement-breakpoint
CREATE INDEX `practice_windows_expires_at` ON `practice_windows` (`expires_at`);
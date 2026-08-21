CREATE TABLE `backstage_nights` (
	`id` text PRIMARY KEY NOT NULL,
	`night` text NOT NULL,
	`epoch` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`closed_at` integer,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`last_reset_by_user_id` text,
	`last_reset_at` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`last_reset_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backstage_nights_night_unique` ON `backstage_nights` (`night`);--> statement-breakpoint
CREATE TABLE `backstage_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`night_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`token_hash` text NOT NULL,
	`device_name` text,
	`joined_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`night_id`) REFERENCES `backstage_nights`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `backstage_sessions_night_idx` ON `backstage_sessions` (`night_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `backstage_sessions_token_unique` ON `backstage_sessions` (`token_hash`);
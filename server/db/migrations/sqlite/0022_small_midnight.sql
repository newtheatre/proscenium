CREATE TABLE `backstage_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`night_id` text NOT NULL,
	`direction` text NOT NULL,
	`preset_id` text,
	`label` text NOT NULL,
	`milestone` text,
	`body` text,
	`sender_user_id` text,
	`sender_session_id` text,
	`sender_name` text,
	`acknowledged_at` integer,
	`acknowledged_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`night_id`) REFERENCES `backstage_nights`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`preset_id`) REFERENCES `backstage_presets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sender_session_id`) REFERENCES `backstage_sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `backstage_messages_night_idx` ON `backstage_messages` (`night_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `backstage_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`direction` text NOT NULL,
	`label` text NOT NULL,
	`milestone` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `backstage_presets_direction_idx` ON `backstage_presets` (`direction`,`sort`);
CREATE TABLE `access_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`access_card_number` text,
	`difficulty_standing` integer DEFAULT false NOT NULL,
	`difficulty_with_crowds` integer DEFAULT false NOT NULL,
	`level_access` integer DEFAULT false NOT NULL,
	`distance` integer DEFAULT false NOT NULL,
	`urgent_toilet` integer DEFAULT false NOT NULL,
	`visual_information` integer DEFAULT false NOT NULL,
	`audible_information` integer DEFAULT false NOT NULL,
	`miscellaneous` integer DEFAULT false NOT NULL,
	`companions` integer DEFAULT 0 NOT NULL,
	`foh_note` text,
	`consent_foh_at` integer,
	`verified_by_user_id` text,
	`verified_at` integer,
	`expires_at` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`verified_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_profiles_user_unique` ON `access_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `access_profiles_status_idx` ON `access_profiles` (`status`);
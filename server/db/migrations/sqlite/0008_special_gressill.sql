CREATE TABLE `fellowships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`awarded_on` text NOT NULL,
	`awarded_by` text NOT NULL,
	`citation` text NOT NULL,
	`revoked_at` integer,
	`revoked_by` text,
	`revocation_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fellowships_user_id_unique` ON `fellowships` (`user_id`);--> statement-breakpoint
CREATE INDEX `fellowships_revoked_at` ON `fellowships` (`revoked_at`);
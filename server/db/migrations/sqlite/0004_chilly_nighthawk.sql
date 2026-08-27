CREATE TABLE `mfa_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mfa_attempts_user` ON `mfa_attempts` (`user_id`);--> statement-breakpoint
CREATE INDEX `mfa_attempts_expires_at` ON `mfa_attempts` (`expires_at`);
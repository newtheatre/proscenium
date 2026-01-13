CREATE TABLE `email_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_verifications_token_unique` ON `email_verifications` (`token`);--> statement-breakpoint
CREATE INDEX `email_verifications_user_id_idx` ON `email_verifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `email_verifications_token_idx` ON `email_verifications` (`token`);--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_token_unique` ON `password_resets` (`token`);--> statement-breakpoint
CREATE INDEX `password_resets_user_id_idx` ON `password_resets` (`user_id`);--> statement-breakpoint
CREATE INDEX `password_resets_token_idx` ON `password_resets` (`token`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `email_verification_token`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `email_verification_expires`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `password_reset_token`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `password_reset_expires`;
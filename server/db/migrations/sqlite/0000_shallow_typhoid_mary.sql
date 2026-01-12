CREATE TABLE `user_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_roles_user_id_idx` ON `user_roles` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_roles_user_id_role_unique` ON `user_roles` (`user_id`,`role`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password` text,
	`full_name` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`email_verification_token` text,
	`email_verification_expires` integer,
	`password_reset_token` text,
	`password_reset_expires` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	`last_login` text,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);
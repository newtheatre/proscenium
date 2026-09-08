CREATE TABLE `shift_contact_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`visible` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

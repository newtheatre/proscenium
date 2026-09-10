CREATE TABLE `notification_digest_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`topic` text NOT NULL,
	`type` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`digest_log_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notification_digest_entries_topic" CHECK("notification_digest_entries"."topic" IN ('BOOKINGS', 'SHIFTS', 'TRAINING', 'ROOMS', 'ANNOUNCEMENTS'))
);
--> statement-breakpoint
CREATE INDEX `notification_digest_entries_due` ON `notification_digest_entries` (`topic`,`user_id`,`digest_log_id`);
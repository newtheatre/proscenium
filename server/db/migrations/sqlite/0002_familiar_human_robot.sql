CREATE TABLE `inbox_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inbox_items_user_created` ON `inbox_items` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`channel` text NOT NULL,
	`subject` text,
	`status` text NOT NULL,
	`sent_at` integer,
	`error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "notification_log_status" CHECK("notification_log"."status" IN ('SENT', 'FAILED', 'RETRYING', 'SKIPPED_UNDELIVERABLE')),
	CONSTRAINT "notification_log_channel" CHECK("notification_log"."channel" IN ('EMAIL', 'INBOX', 'PUSH'))
);
--> statement-breakpoint
CREATE INDEX `notification_log_user` ON `notification_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `notification_log_type` ON `notification_log` (`type`);--> statement-breakpoint
CREATE INDEX `notification_log_status` ON `notification_log` (`status`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` text NOT NULL,
	`topic` text NOT NULL,
	`email` integer DEFAULT true NOT NULL,
	`push` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notification_preferences_topic" CHECK("notification_preferences"."topic" IN ('BOOKINGS', 'SHIFTS', 'TRAINING', 'ROOMS', 'ANNOUNCEMENTS'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_preferences_user_topic` ON `notification_preferences` (`user_id`,`topic`);
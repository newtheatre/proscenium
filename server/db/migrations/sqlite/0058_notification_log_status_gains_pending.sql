PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_notification_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`channel` text NOT NULL,
	`subject` text,
	`status` text NOT NULL,
	`record_id` text,
	`session_id` text,
	`claim` text,
	`sent_at` integer,
	`error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "notification_log_status" CHECK("__new_notification_log"."status" IN ('PENDING', 'SENT', 'FAILED', 'RETRYING', 'SKIPPED_UNDELIVERABLE')),
	CONSTRAINT "notification_log_channel" CHECK("__new_notification_log"."channel" IN ('EMAIL', 'INBOX', 'PUSH'))
);
--> statement-breakpoint
INSERT INTO `__new_notification_log`("id", "user_id", "type", "channel", "subject", "status", "record_id", "session_id", "claim", "sent_at", "error", "created_at") SELECT "id", "user_id", "type", "channel", "subject", "status", "record_id", "session_id", "claim", "sent_at", "error", "created_at" FROM `notification_log`;--> statement-breakpoint
DROP TABLE `notification_log`;--> statement-breakpoint
ALTER TABLE `__new_notification_log` RENAME TO `notification_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `notification_log_user` ON `notification_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `notification_log_type` ON `notification_log` (`type`);--> statement-breakpoint
CREATE INDEX `notification_log_status` ON `notification_log` (`status`);--> statement-breakpoint
CREATE INDEX `notification_log_record` ON `notification_log` (`record_id`);--> statement-breakpoint
CREATE INDEX `notification_log_created_at` ON `notification_log` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_log_claim` ON `notification_log` (`claim`) WHERE claim is not null;
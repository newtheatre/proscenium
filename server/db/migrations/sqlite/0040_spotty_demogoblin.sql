ALTER TABLE `notification_log` ADD `record_id` text;--> statement-breakpoint
ALTER TABLE `notification_log` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `notification_log` ADD `claim` text;--> statement-breakpoint
CREATE INDEX `notification_log_record` ON `notification_log` (`record_id`);--> statement-breakpoint
CREATE INDEX `notification_log_created_at` ON `notification_log` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_log_claim` ON `notification_log` (`claim`) WHERE claim is not null;
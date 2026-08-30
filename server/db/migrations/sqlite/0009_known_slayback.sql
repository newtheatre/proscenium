DROP INDEX `memberships_user_year`;--> statement-breakpoint
ALTER TABLE `memberships` ADD `starts_on` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `expires_on` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `memberships` ADD `confirmed_by` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `renewal_notice_at` integer;--> statement-breakpoint
CREATE INDEX `memberships_user` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE INDEX `memberships_expires_on` ON `memberships` (`expires_on`);--> statement-breakpoint
ALTER TABLE `users` ADD `student_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_student_id` ON `users` (`student_id`);
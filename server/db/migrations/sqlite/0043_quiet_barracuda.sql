ALTER TABLE `training_sessions` ADD `register_opened_at` integer;--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `register_opened_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `marked_at` integer;--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `marked_by` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `training_sessions_register_opened_at` ON `training_sessions` (`register_opened_at`);
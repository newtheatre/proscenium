ALTER TABLE `training_sessions` ADD `cancelled_at` integer;--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `cancelled_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `cancel_reason` text;
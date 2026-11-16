ALTER TABLE `core_files` ADD `expires_at` integer;--> statement-breakpoint
CREATE INDEX `core_files_expiry` ON `core_files` (`expires_at`);
ALTER TABLE `forms_responses` ADD `change_token_hash` text;--> statement-breakpoint
ALTER TABLE `forms_responses` ADD `change_token_expires_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `forms_responses_change_token` ON `forms_responses` (`change_token_hash`) WHERE change_token_hash IS NOT NULL;
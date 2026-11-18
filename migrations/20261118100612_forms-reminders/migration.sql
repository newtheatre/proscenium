ALTER TABLE `forms_responses` ADD `reminded_waiting_at` integer;--> statement-breakpoint
ALTER TABLE `forms_responses` ADD `reminded_closing_at` integer;--> statement-breakpoint
ALTER TABLE `forms_review_assignments` ADD `reminded_at` integer;--> statement-breakpoint
CREATE INDEX `forms_responses_waiting` ON `forms_responses` (`state`,`stage_kind`);
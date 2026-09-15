ALTER TABLE `shift_templates` ADD `starts_before_doors_minutes` integer;--> statement-breakpoint
ALTER TABLE `shift_templates` ADD `ends_after_end_minutes` integer;--> statement-breakpoint
ALTER TABLE `shifts` ADD `starts_at` integer;--> statement-breakpoint
ALTER TABLE `shifts` ADD `ends_at` integer;
ALTER TABLE `rooms` ADD `is_external` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `campus` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `building` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `contact` text;--> statement-breakpoint
CREATE INDEX `rooms_is_external` ON `rooms` (`is_external`);
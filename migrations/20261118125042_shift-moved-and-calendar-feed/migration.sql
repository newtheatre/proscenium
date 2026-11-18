CREATE TABLE `front_of_house_calendar_feeds` (
	`account_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`generation` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `front_of_house_assignments` ADD `moved_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_calendar_feeds_token` ON `front_of_house_calendar_feeds` (`token_hash`);
CREATE TABLE `calendar_feed_tokens` (
	`account_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`generation` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS `front_of_house_calendar_feeds_token`;--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_feed_tokens_token` ON `calendar_feed_tokens` (`token_hash`);--> statement-breakpoint
-- Front of house's feeds carry over with their hash and generation, so old addresses still answer (C-70, CF5).
INSERT INTO `calendar_feed_tokens` (`account_id`, `token_hash`, `generation`, `created_at`) SELECT `account_id`, `token_hash`, `generation`, `created_at` FROM `front_of_house_calendar_feeds`;--> statement-breakpoint
DROP TABLE `front_of_house_calendar_feeds`;
-- Written by hand: a percentage off a bar list is now a promotion, so the lists lose percent_off. The trigger on
-- bar_prices reads that column, so it goes before the table is made again (the one on bar_price_lists goes with the table).
DROP TRIGGER IF EXISTS `bar_prices_not_on_percent_list`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_price_lists_percent_without_prices`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bar_price_lists` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`system_key` text,
	`restricted` integer DEFAULT false NOT NULL,
	`falls_back` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "bar_price_lists_standard" CHECK("system_key" IS NULL OR "active" = 1)
);
--> statement-breakpoint
INSERT INTO `__new_bar_price_lists`(`id`, `name`, `system_key`, `restricted`, `falls_back`, `active`, `created_at`, `updated_at`) SELECT `id`, `name`, `system_key`, `restricted`, `falls_back`, `active`, `created_at`, `updated_at` FROM `bar_price_lists`;--> statement-breakpoint
DROP TABLE `bar_price_lists`;--> statement-breakpoint
ALTER TABLE `__new_bar_price_lists` RENAME TO `bar_price_lists`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_price_lists_name` ON `bar_price_lists` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `bar_price_lists_system_key` ON `bar_price_lists` (`system_key`) WHERE system_key IS NOT NULL;
ALTER TABLE `show_categories` ADD `archived` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `show_categories_name_nocase` ON `show_categories` ("name" COLLATE NOCASE);--> statement-breakpoint
ALTER TABLE `venues` ADD `archived` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `venues_name_nocase` ON `venues` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_name_nocase` ON `seasons` ("name" COLLATE NOCASE);
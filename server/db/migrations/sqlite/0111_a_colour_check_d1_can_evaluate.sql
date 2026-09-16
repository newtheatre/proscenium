-- The colour CHECK is rewritten to a pattern D1 will evaluate (0081). `PRAGMA foreign_keys=OFF`
-- is a no-op inside D1's transaction, so this runs before the catalogue carries a row (0063).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bar_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`colour` text,
	CONSTRAINT "bar_categories_colour_hex" CHECK("__new_bar_categories"."colour" IS NULL OR lower("__new_bar_categories"."colour") GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]')
);
--> statement-breakpoint
INSERT INTO `__new_bar_categories`("id", "name", "sort", "colour") SELECT "id", "name", "sort", "colour" FROM `bar_categories`;--> statement-breakpoint
DROP TABLE `bar_categories`;--> statement-breakpoint
ALTER TABLE `__new_bar_categories` RENAME TO `bar_categories`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_categories_name_nocase` ON `bar_categories` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_categories_name` ON `bar_categories` (`name`);
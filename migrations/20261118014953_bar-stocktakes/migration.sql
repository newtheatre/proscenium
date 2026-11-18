CREATE TABLE `bar_stocktake_lines` (
	`id` text PRIMARY KEY,
	`stocktake_id` text NOT NULL,
	`stock_item_id` text NOT NULL,
	`counted` integer,
	`expected` integer,
	`variance_reason_term` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_stocktake_lines_stocktake_id_bar_stocktakes_id_fk` FOREIGN KEY (`stocktake_id`) REFERENCES `bar_stocktakes`(`id`),
	CONSTRAINT `fk_bar_stocktake_lines_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT `fk_bar_stocktake_lines_variance_reason_term_core_terms_id_fk` FOREIGN KEY (`variance_reason_term`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "bar_stocktake_lines_counted" CHECK("counted" IS NULL OR "counted" >= 0)
);
--> statement-breakpoint
CREATE TABLE `bar_stocktakes` (
	`id` text PRIMARY KEY,
	`location_id` text NOT NULL,
	`state` text NOT NULL,
	`scope` text NOT NULL,
	`category_id` text,
	`started_by` text NOT NULL,
	`submitted_by` text,
	`approved_by` text,
	`started_at` integer NOT NULL,
	`submitted_at` integer,
	`approved_at` integer,
	`variance_value_minor` integer,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_stocktakes_location_id_bar_stock_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `bar_stock_locations`(`id`),
	CONSTRAINT `fk_bar_stocktakes_category_id_bar_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `bar_categories`(`id`),
	CONSTRAINT "bar_stocktakes_state" CHECK("state" IN ('counting', 'submitted', 'approved', 'abandoned')),
	CONSTRAINT "bar_stocktakes_scope" CHECK("scope" IN ('full', 'category') AND ("scope" = 'category') = ("category_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bar_stocktake_lines_item` ON `bar_stocktake_lines` (`stocktake_id`,`stock_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_stocktakes_live` ON `bar_stocktakes` (`location_id`) WHERE state IN ('counting', 'submitted');--> statement-breakpoint
CREATE INDEX `bar_stocktakes_state` ON `bar_stocktakes` (`state`,`started_at`);
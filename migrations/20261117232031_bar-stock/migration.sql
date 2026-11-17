CREATE TABLE `bar_recipe_lines` (
	`id` text PRIMARY KEY,
	`variant_id` text NOT NULL,
	`stock_item_id` text,
	`choice_group_id` text,
	`quantity` integer NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_recipe_lines_variant_id_bar_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `bar_variants`(`id`),
	CONSTRAINT `fk_bar_recipe_lines_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT `fk_bar_recipe_lines_choice_group_id_bar_choice_groups_id_fk` FOREIGN KEY (`choice_group_id`) REFERENCES `bar_choice_groups`(`id`),
	CONSTRAINT "bar_recipe_lines_one" CHECK(("stock_item_id" IS NULL) <> ("choice_group_id" IS NULL)),
	CONSTRAINT "bar_recipe_lines_quantity" CHECK("quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE `bar_stock_items` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`category_id` text,
	`base_unit` text NOT NULL,
	`pack_size` integer NOT NULL,
	`pack_name` text NOT NULL,
	`count_unit_size` integer NOT NULL,
	`cost_minor` integer,
	`currency` text NOT NULL,
	`reorder_level` integer,
	`full_weight_g` integer,
	`empty_weight_g` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_stock_items_category_id_bar_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `bar_categories`(`id`),
	CONSTRAINT "bar_stock_items_unit" CHECK("base_unit" IN ('each', 'ml', 'g')),
	CONSTRAINT "bar_stock_items_sizes" CHECK("pack_size" >= 1 AND "count_unit_size" >= 1),
	CONSTRAINT "bar_stock_items_cost" CHECK("cost_minor" IS NULL OR "cost_minor" >= 0),
	CONSTRAINT "bar_stock_items_reorder" CHECK("reorder_level" IS NULL OR "reorder_level" >= 0),
	CONSTRAINT "bar_stock_items_weights" CHECK(("full_weight_g" IS NULL) = ("empty_weight_g" IS NULL) AND ("full_weight_g" IS NULL OR "full_weight_g" > "empty_weight_g" AND "empty_weight_g" >= 0))
);
--> statement-breakpoint
CREATE TABLE `bar_stock_levels` (
	`stock_item_id` text NOT NULL,
	`location_id` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`last_counted_at` integer,
	CONSTRAINT `bar_stock_levels_pk` PRIMARY KEY(`stock_item_id`, `location_id`),
	CONSTRAINT `fk_bar_stock_levels_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT `fk_bar_stock_levels_location_id_bar_stock_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `bar_stock_locations`(`id`)
);
--> statement-breakpoint
CREATE TABLE `bar_stock_locations` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`space_id` text,
	`venue_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_stock_locations_space_id_core_spaces_id_fk` FOREIGN KEY (`space_id`) REFERENCES `core_spaces`(`id`),
	CONSTRAINT `fk_bar_stock_locations_venue_id_core_venues_id_fk` FOREIGN KEY (`venue_id`) REFERENCES `core_venues`(`id`)
);
--> statement-breakpoint
CREATE TABLE `bar_stock_movements` (
	`id` text PRIMARY KEY,
	`stock_item_id` text NOT NULL,
	`location_id` text NOT NULL,
	`kind` text NOT NULL,
	`quantity` integer NOT NULL,
	`reason_term` text,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`by` text,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_stock_movements_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT `fk_bar_stock_movements_location_id_bar_stock_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `bar_stock_locations`(`id`),
	CONSTRAINT `fk_bar_stock_movements_reason_term_core_terms_id_fk` FOREIGN KEY (`reason_term`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "bar_stock_movements_kind" CHECK("kind" IN ('opening', 'delivery', 'sale', 'sale_reversal', 'wastage', 'adjustment', 'transfer_out', 'transfer_in')),
	CONSTRAINT "bar_stock_movements_sign" CHECK("quantity" <> 0 AND ("kind" IN ('opening', 'adjustment') OR ("kind" IN ('delivery', 'transfer_in', 'sale_reversal')) = ("quantity" > 0))),
	CONSTRAINT "bar_stock_movements_wastage" CHECK("kind" <> 'wastage' OR "reason_term" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE `bar_choice_options` ADD `stock_item_id` text REFERENCES bar_stock_items(id);--> statement-breakpoint
ALTER TABLE `bar_outlets` ADD `stock_location_id` text REFERENCES bar_stock_locations(id);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_recipe_lines_item` ON `bar_recipe_lines` (`variant_id`,`stock_item_id`) WHERE stock_item_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_recipe_lines_group` ON `bar_recipe_lines` (`variant_id`,`choice_group_id`) WHERE choice_group_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_stock_items_name` ON `bar_stock_items` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `bar_stock_locations_name` ON `bar_stock_locations` (lower("name")) WHERE active = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_stock_movements_key` ON `bar_stock_movements` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `bar_stock_movements_level` ON `bar_stock_movements` (`stock_item_id`,`location_id`,`at`);--> statement-breakpoint
CREATE INDEX `bar_stock_movements_source` ON `bar_stock_movements` (`source_type`,`source_id`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_stock_movements_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_movements_append_only_delete` BEFORE DELETE ON `bar_stock_movements` BEGIN SELECT RAISE(ABORT, 'append-only: bar_stock_movements'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_stock_movements_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_movements_append_only_update` BEFORE UPDATE ON `bar_stock_movements` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`stock_item_id` IS OLD.`stock_item_id` AND NEW.`location_id` IS OLD.`location_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`quantity` IS OLD.`quantity` AND NEW.`reason_term` IS OLD.`reason_term` AND NEW.`source_type` IS OLD.`source_type` AND NEW.`source_id` IS OLD.`source_id` AND NEW.`idempotency_key` IS OLD.`idempotency_key` AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_stock_movements'); END;
--> statement-breakpoint
-- Written by hand: a level is a cache of its movements (Bar specification, tab 2). Re-append after regenerating.
CREATE TRIGGER `bar_stock_movements_level` AFTER INSERT ON `bar_stock_movements` BEGIN INSERT OR IGNORE INTO `bar_stock_levels` (`stock_item_id`, `location_id`, `quantity`) VALUES (NEW.`stock_item_id`, NEW.`location_id`, 0); UPDATE `bar_stock_levels` SET `quantity` = `quantity` + NEW.`quantity` WHERE `stock_item_id` = NEW.`stock_item_id` AND `location_id` = NEW.`location_id`; END;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_levels_from_movements` BEFORE UPDATE OF `quantity`, `stock_item_id`, `location_id` ON `bar_stock_levels` WHEN NEW.`stock_item_id` IS NOT OLD.`stock_item_id` OR NEW.`location_id` IS NOT OLD.`location_id` OR NEW.`quantity` IS NOT (SELECT coalesce(sum(`quantity`), 0) FROM `bar_stock_movements` WHERE `stock_item_id` = NEW.`stock_item_id` AND `location_id` = NEW.`location_id`) BEGIN SELECT RAISE(ABORT, 'bar: a stock level changes only by a movement'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_levels_insert` BEFORE INSERT ON `bar_stock_levels` WHEN NEW.`quantity` <> 0 BEGIN SELECT RAISE(ABORT, 'bar: a stock level changes only by a movement'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_levels_delete` BEFORE DELETE ON `bar_stock_levels` BEGIN SELECT RAISE(ABORT, 'bar: a stock level changes only by a movement'); END;

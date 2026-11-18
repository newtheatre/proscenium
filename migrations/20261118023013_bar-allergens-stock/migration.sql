CREATE TABLE `bar_stock_item_allergen_checks` (
	`id` text PRIMARY KEY,
	`stock_item_id` text NOT NULL,
	`source` text NOT NULL,
	`contains` text NOT NULL,
	`may_contain` text NOT NULL,
	`by` text NOT NULL,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_stock_item_allergen_checks_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT "bar_stock_item_allergen_checks_source" CHECK("source" IN ('label', 'supplier', 'other'))
);
--> statement-breakpoint
ALTER TABLE `bar_allergen_entries` ADD `stock_item_id` text REFERENCES bar_stock_items(id);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bar_allergen_entries` (
	`id` text PRIMARY KEY,
	`product_id` text,
	`option_id` text,
	`stock_item_id` text,
	`allergen` text NOT NULL,
	`level` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_allergen_entries_product_id_bar_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`),
	CONSTRAINT `fk_bar_allergen_entries_option_id_bar_choice_options_id_fk` FOREIGN KEY (`option_id`) REFERENCES `bar_choice_options`(`id`),
	CONSTRAINT `fk_bar_allergen_entries_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT "bar_allergen_entries_one" CHECK(("product_id" IS NOT NULL) + ("option_id" IS NOT NULL) + ("stock_item_id" IS NOT NULL) = 1),
	CONSTRAINT "bar_allergen_entries_allergen" CHECK("allergen" IN ('gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soya', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs')),
	CONSTRAINT "bar_allergen_entries_level" CHECK("level" IN ('contains', 'may_contain'))
);
--> statement-breakpoint
INSERT INTO `__new_bar_allergen_entries`(`id`, `product_id`, `option_id`, `allergen`, `level`, `created_at`) SELECT `id`, `product_id`, `option_id`, `allergen`, `level`, `created_at` FROM `bar_allergen_entries`;--> statement-breakpoint
DROP TABLE `bar_allergen_entries`;--> statement-breakpoint
ALTER TABLE `__new_bar_allergen_entries` RENAME TO `bar_allergen_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_allergen_entries_product` ON `bar_allergen_entries` (`product_id`,`allergen`) WHERE product_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_allergen_entries_option` ON `bar_allergen_entries` (`option_id`,`allergen`) WHERE option_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_allergen_entries_stock_item` ON `bar_allergen_entries` (`stock_item_id`,`allergen`) WHERE stock_item_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `bar_stock_item_allergen_checks_item` ON `bar_stock_item_allergen_checks` (`stock_item_id`,`at`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_stock_item_allergen_checks_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_item_allergen_checks_append_only_delete` BEFORE DELETE ON `bar_stock_item_allergen_checks` BEGIN SELECT RAISE(ABORT, 'append-only: bar_stock_item_allergen_checks'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_stock_item_allergen_checks_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_item_allergen_checks_append_only_update` BEFORE UPDATE ON `bar_stock_item_allergen_checks` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`stock_item_id` IS OLD.`stock_item_id` AND NEW.`source` IS OLD.`source` AND NEW.`contains` IS OLD.`contains` AND NEW.`may_contain` IS OLD.`may_contain` AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_stock_item_allergen_checks'); END;

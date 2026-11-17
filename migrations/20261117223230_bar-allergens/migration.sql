CREATE TABLE `bar_allergen_checks` (
	`id` text PRIMARY KEY,
	`product_id` text,
	`option_id` text,
	`source` text NOT NULL,
	`contains` text NOT NULL,
	`may_contain` text NOT NULL,
	`by` text NOT NULL,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_allergen_checks_product_id_bar_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`),
	CONSTRAINT `fk_bar_allergen_checks_option_id_bar_choice_options_id_fk` FOREIGN KEY (`option_id`) REFERENCES `bar_choice_options`(`id`),
	CONSTRAINT "bar_allergen_checks_one" CHECK(("product_id" IS NULL) <> ("option_id" IS NULL)),
	CONSTRAINT "bar_allergen_checks_source" CHECK("source" IN ('label', 'supplier', 'other'))
);
--> statement-breakpoint
CREATE TABLE `bar_allergen_entries` (
	`id` text PRIMARY KEY,
	`product_id` text,
	`option_id` text,
	`allergen` text NOT NULL,
	`level` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_allergen_entries_product_id_bar_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`),
	CONSTRAINT `fk_bar_allergen_entries_option_id_bar_choice_options_id_fk` FOREIGN KEY (`option_id`) REFERENCES `bar_choice_options`(`id`),
	CONSTRAINT "bar_allergen_entries_one" CHECK(("product_id" IS NULL) <> ("option_id" IS NULL)),
	CONSTRAINT "bar_allergen_entries_allergen" CHECK("allergen" IN ('gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soya', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs')),
	CONSTRAINT "bar_allergen_entries_level" CHECK("level" IN ('contains', 'may_contain'))
);
--> statement-breakpoint
CREATE INDEX `bar_allergen_checks_product` ON `bar_allergen_checks` (`product_id`,`at`);--> statement-breakpoint
CREATE INDEX `bar_allergen_checks_option` ON `bar_allergen_checks` (`option_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_allergen_entries_product` ON `bar_allergen_entries` (`product_id`,`allergen`) WHERE product_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_allergen_entries_option` ON `bar_allergen_entries` (`option_id`,`allergen`) WHERE option_id IS NOT NULL;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_allergen_checks_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_allergen_checks_append_only_delete` BEFORE DELETE ON `bar_allergen_checks` BEGIN SELECT RAISE(ABORT, 'append-only: bar_allergen_checks'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_allergen_checks_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_allergen_checks_append_only_update` BEFORE UPDATE ON `bar_allergen_checks` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`product_id` IS OLD.`product_id` AND NEW.`option_id` IS OLD.`option_id` AND NEW.`source` IS OLD.`source` AND NEW.`contains` IS OLD.`contains` AND NEW.`may_contain` IS OLD.`may_contain` AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_allergen_checks'); END;

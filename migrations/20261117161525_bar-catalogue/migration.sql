CREATE TABLE `bar_categories` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`colour` text,
	`income_account_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bar_outlets` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`price_list_id` text NOT NULL,
	`space_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_outlets_price_list_id_bar_price_lists_id_fk` FOREIGN KEY (`price_list_id`) REFERENCES `bar_price_lists`(`id`),
	CONSTRAINT `fk_bar_outlets_space_id_core_spaces_id_fk` FOREIGN KEY (`space_id`) REFERENCES `core_spaces`(`id`),
	CONSTRAINT "bar_outlets_kind" CHECK("kind" IN ('bar', 'kiosk', 'desk'))
);
--> statement-breakpoint
CREATE TABLE `bar_price_lists` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`system_key` text,
	`restricted` integer DEFAULT false NOT NULL,
	`falls_back` integer DEFAULT true NOT NULL,
	`percent_off` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "bar_price_lists_percent" CHECK("percent_off" IS NULL OR ("percent_off" BETWEEN 1 AND 100)),
	CONSTRAINT "bar_price_lists_standard" CHECK("system_key" IS NULL OR ("percent_off" IS NULL AND "active" = 1))
);
--> statement-breakpoint
CREATE TABLE `bar_prices` (
	`id` text PRIMARY KEY,
	`variant_id` text NOT NULL,
	`price_list_id` text NOT NULL,
	`amount_minor` integer,
	`currency` text NOT NULL,
	`effective_from` integer NOT NULL,
	`set_by` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_prices_variant_id_bar_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `bar_variants`(`id`),
	CONSTRAINT `fk_bar_prices_price_list_id_bar_price_lists_id_fk` FOREIGN KEY (`price_list_id`) REFERENCES `bar_price_lists`(`id`),
	CONSTRAINT "bar_prices_amount" CHECK("amount_minor" IS NULL OR "amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `bar_products` (
	`id` text PRIMARY KEY,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`age_restricted` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_products_category_id_bar_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `bar_categories`(`id`)
);
--> statement-breakpoint
CREATE TABLE `bar_variants` (
	`id` text PRIMARY KEY,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`barcode` text,
	`position` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_variants_product_id_bar_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bar_categories_name` ON `bar_categories` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `bar_outlets_name` ON `bar_outlets` (lower("name")) WHERE active = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_outlets_one_desk` ON `bar_outlets` (`kind`) WHERE kind = 'desk' AND active = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_price_lists_name` ON `bar_price_lists` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `bar_price_lists_system_key` ON `bar_price_lists` (`system_key`) WHERE system_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX `bar_prices_in_force` ON `bar_prices` (`variant_id`,`price_list_id`,`effective_from`);--> statement-breakpoint
CREATE INDEX `bar_products_category` ON `bar_products` (`category_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_variants_name` ON `bar_variants` (`product_id`,lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `bar_variants_barcode` ON `bar_variants` (`barcode`) WHERE barcode IS NOT NULL;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_prices_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_prices_append_only_delete` BEFORE DELETE ON `bar_prices` BEGIN SELECT RAISE(ABORT, 'append-only: bar_prices'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_prices_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_prices_append_only_update` BEFORE UPDATE ON `bar_prices` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`variant_id` IS OLD.`variant_id` AND NEW.`price_list_id` IS OLD.`price_list_id` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`currency` IS OLD.`currency` AND NEW.`effective_from` IS OLD.`effective_from` AND NEW.`set_by` IS OLD.`set_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_prices'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_prices_not_on_percent_list` BEFORE INSERT ON `bar_prices` WHEN EXISTS (SELECT 1 FROM `bar_price_lists` WHERE `id` = NEW.`price_list_id` AND `percent_off` IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'bar: a percentage list has no prices of its own'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_price_lists_percent_without_prices` BEFORE UPDATE OF `percent_off` ON `bar_price_lists` WHEN NEW.`percent_off` IS NOT NULL AND EXISTS (SELECT 1 FROM `bar_prices` WHERE `price_list_id` = NEW.`id`) BEGIN SELECT RAISE(ABORT, 'bar: a percentage list has no prices of its own'); END;

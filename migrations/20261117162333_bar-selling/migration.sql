CREATE TABLE `bar_openings` (
	`id` text PRIMARY KEY,
	`outlet_id` text NOT NULL,
	`performance_id` text,
	`operating_day` text NOT NULL,
	`state` text NOT NULL,
	`opened_by` text NOT NULL,
	`closed_by` text,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_openings_outlet_id_bar_outlets_id_fk` FOREIGN KEY (`outlet_id`) REFERENCES `bar_outlets`(`id`),
	CONSTRAINT `fk_bar_openings_performance_id_core_performances_id_fk` FOREIGN KEY (`performance_id`) REFERENCES `core_performances`(`id`),
	CONSTRAINT "bar_openings_state" CHECK("state" IN ('open', 'closed'))
);
--> statement-breakpoint
CREATE TABLE `bar_sale_lines` (
	`id` text PRIMARY KEY,
	`sale_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`price_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_minor` integer NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`amount_minor` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_sale_lines_sale_id_bar_sales_id_fk` FOREIGN KEY (`sale_id`) REFERENCES `bar_sales`(`id`),
	CONSTRAINT `fk_bar_sale_lines_variant_id_bar_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `bar_variants`(`id`),
	CONSTRAINT `fk_bar_sale_lines_price_id_bar_prices_id_fk` FOREIGN KEY (`price_id`) REFERENCES `bar_prices`(`id`),
	CONSTRAINT "bar_sale_lines_quantity" CHECK("quantity" >= 1),
	CONSTRAINT "bar_sale_lines_unit" CHECK("unit_minor" >= 0),
	CONSTRAINT "bar_sale_lines_discount" CHECK("discount_minor" >= 0 AND "discount_minor" <= "unit_minor" * "quantity"),
	CONSTRAINT "bar_sale_lines_amount" CHECK("amount_minor" = "unit_minor" * "quantity" - "discount_minor")
);
--> statement-breakpoint
CREATE TABLE `bar_sales` (
	`id` text PRIMARY KEY,
	`reference` text NOT NULL,
	`opening_id` text NOT NULL,
	`price_list_id` text NOT NULL,
	`state` text NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`intent_id` text,
	`part_id` text,
	`channel` text NOT NULL,
	`sold_by` text NOT NULL,
	`client_key` text NOT NULL,
	`paid_at` integer,
	`voided_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_sales_opening_id_bar_openings_id_fk` FOREIGN KEY (`opening_id`) REFERENCES `bar_openings`(`id`),
	CONSTRAINT `fk_bar_sales_price_list_id_bar_price_lists_id_fk` FOREIGN KEY (`price_list_id`) REFERENCES `bar_price_lists`(`id`),
	CONSTRAINT "bar_sales_state" CHECK("state" IN ('open', 'awaiting_payment', 'paid', 'void')),
	CONSTRAINT "bar_sales_channel" CHECK("channel" IN ('till', 'desk', 'self')),
	CONSTRAINT "bar_sales_total" CHECK("total_minor" >= 0),
	CONSTRAINT "bar_sales_paid" CHECK("state" <> 'paid' OR "paid_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bar_openings_one_open` ON `bar_openings` (`outlet_id`) WHERE state = 'open';--> statement-breakpoint
CREATE INDEX `bar_openings_day` ON `bar_openings` (`operating_day`);--> statement-breakpoint
CREATE INDEX `bar_sale_lines_sale` ON `bar_sale_lines` (`sale_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_sales_reference` ON `bar_sales` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_sales_client_key` ON `bar_sales` (`client_key`);--> statement-breakpoint
CREATE INDEX `bar_sales_opening` ON `bar_sales` (`opening_id`,`state`);--> statement-breakpoint
CREATE INDEX `bar_sales_intent` ON `bar_sales` (`intent_id`);--> statement-breakpoint
-- Written by hand: the bar sale's life cycle (Bar specification, tab 2). Re-append after regenerating.
CREATE TRIGGER `bar_sale_lines_while_open_insert` BEFORE INSERT ON `bar_sale_lines` WHEN NOT EXISTS (SELECT 1 FROM `bar_sales` WHERE `id` = NEW.`sale_id` AND `state` = 'open') BEGIN SELECT RAISE(ABORT, 'bar: lines change only while the sale is open'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_lines_while_open_update` BEFORE UPDATE ON `bar_sale_lines` WHEN NOT EXISTS (SELECT 1 FROM `bar_sales` WHERE `id` = OLD.`sale_id` AND `state` = 'open') OR NEW.`sale_id` <> OLD.`sale_id` BEGIN SELECT RAISE(ABORT, 'bar: lines change only while the sale is open'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_lines_while_open_delete` BEFORE DELETE ON `bar_sale_lines` WHEN NOT EXISTS (SELECT 1 FROM `bar_sales` WHERE `id` = OLD.`sale_id` AND `state` = 'open') BEGIN SELECT RAISE(ABORT, 'bar: lines change only while the sale is open'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_lines_total_insert` AFTER INSERT ON `bar_sale_lines` BEGIN UPDATE `bar_sales` SET `total_minor` = `total_minor` + NEW.`amount_minor` WHERE `id` = NEW.`sale_id`; END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_lines_total_update` AFTER UPDATE OF `amount_minor` ON `bar_sale_lines` BEGIN UPDATE `bar_sales` SET `total_minor` = `total_minor` - OLD.`amount_minor` + NEW.`amount_minor` WHERE `id` = NEW.`sale_id`; END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_lines_total_delete` AFTER DELETE ON `bar_sale_lines` BEGIN UPDATE `bar_sales` SET `total_minor` = `total_minor` - OLD.`amount_minor` WHERE `id` = OLD.`sale_id`; END;
--> statement-breakpoint
CREATE TRIGGER `bar_sales_insert` BEFORE INSERT ON `bar_sales` WHEN NEW.`state` <> 'open' OR NEW.`total_minor` <> 0 BEGIN SELECT RAISE(ABORT, 'bar: a bar sale starts open and empty'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sales_life` BEFORE UPDATE ON `bar_sales` WHEN (OLD.`state` IN ('paid', 'void') AND NOT (NEW.`state` IS OLD.`state` AND NEW.`total_minor` IS OLD.`total_minor` AND NEW.`intent_id` IS OLD.`intent_id` AND NEW.`paid_at` IS OLD.`paid_at`)) OR (NEW.`state` <> OLD.`state` AND NOT ((OLD.`state` = 'open' AND NEW.`state` IN ('awaiting_payment', 'void', 'paid')) OR (OLD.`state` = 'awaiting_payment' AND NEW.`state` IN ('open', 'paid')))) OR (OLD.`state` = 'open' AND NEW.`state` IN ('awaiting_payment', 'paid') AND NOT EXISTS (SELECT 1 FROM `bar_sale_lines` WHERE `sale_id` = NEW.`id`)) OR (OLD.`state` <> 'open' AND NEW.`total_minor` <> OLD.`total_minor`) OR NEW.`opening_id` <> OLD.`opening_id` BEGIN SELECT RAISE(ABORT, 'bar: a bar sale moves only along its life cycle'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_openings_closed_final` BEFORE UPDATE ON `bar_openings` WHEN OLD.`state` = 'closed' BEGIN SELECT RAISE(ABORT, 'bar: a closed opening is final'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sales_open_opening` BEFORE INSERT ON `bar_sales` WHEN NOT EXISTS (SELECT 1 FROM `bar_openings` WHERE `id` = NEW.`opening_id` AND `state` = 'open') BEGIN SELECT RAISE(ABORT, 'bar: a bar sale is made in an open opening'); END;

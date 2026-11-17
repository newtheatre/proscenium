ALTER TABLE `box_office_orders` ADD `basket_token_hash` text;--> statement-breakpoint
ALTER TABLE `box_office_orders` ADD `confirm_token_hash` text;--> statement-breakpoint
ALTER TABLE `box_office_orders` ADD `confirm_expires_at` integer;--> statement-breakpoint
ALTER TABLE `box_office_orders` ADD `confirm_email` text;--> statement-breakpoint
ALTER TABLE `box_office_orders` ADD `confirm_name` text;--> statement-breakpoint
ALTER TABLE `box_office_orders` ADD `link_token_expires_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_orders_basket_token` ON `box_office_orders` (`basket_token_hash`) WHERE basket_token_hash IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_orders_confirm_token` ON `box_office_orders` (`confirm_token_hash`) WHERE confirm_token_hash IS NOT NULL;
--> statement-breakpoint
-- Written by hand. An address waits to be confirmed only on a basket: with its token and an end no
-- later than the basket's, or not at all.
CREATE TRIGGER `box_office_orders_confirming` BEFORE UPDATE ON `box_office_orders` WHEN NOT ((NEW.`confirm_token_hash` IS NULL AND NEW.`confirm_email` IS NULL AND NEW.`confirm_name` IS NULL AND NEW.`confirm_expires_at` IS NULL) OR (NEW.`state` = 'basket' AND NEW.`confirm_token_hash` IS NOT NULL AND NEW.`confirm_email` IS NOT NULL AND NEW.`confirm_expires_at` IS NOT NULL AND NEW.`confirm_expires_at` <= NEW.`expires_at`)) BEGIN SELECT RAISE(ABORT, 'box-office: only a basket waits for its address to be confirmed'); END;

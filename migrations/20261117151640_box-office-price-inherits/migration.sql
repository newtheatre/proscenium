ALTER TABLE `box_office_prices` ADD `inherits` integer DEFAULT false NOT NULL;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_prices_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `box_office_prices_append_only_delete` BEFORE DELETE ON `box_office_prices` BEGIN SELECT RAISE(ABORT, 'append-only: box_office_prices'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_prices_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `box_office_prices_append_only_update` BEFORE UPDATE ON `box_office_prices` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`production_id` IS OLD.`production_id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`band_id` IS OLD.`band_id` AND NEW.`ticket_type_id` IS OLD.`ticket_type_id` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`inherits` IS OLD.`inherits` AND NEW.`currency` IS OLD.`currency` AND NEW.`effective_from` IS OLD.`effective_from` AND NEW.`set_by` IS OLD.`set_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: box_office_prices'); END;

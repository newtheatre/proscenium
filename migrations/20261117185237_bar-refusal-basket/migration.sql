ALTER TABLE `bar_age_checks` ADD `basket_key` text;--> statement-breakpoint
CREATE INDEX `bar_age_checks_basket` ON `bar_age_checks` (`basket_key`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_age_checks_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_age_checks_append_only_delete` BEFORE DELETE ON `bar_age_checks` BEGIN SELECT RAISE(ABORT, 'append-only: bar_age_checks'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_age_checks_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_age_checks_append_only_update` BEFORE UPDATE ON `bar_age_checks` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`opening_id` IS OLD.`opening_id` AND NEW.`sale_id` IS OLD.`sale_id` AND NEW.`outcome` IS OLD.`outcome` AND NEW.`refusal_term` IS OLD.`refusal_term` AND NEW.`variant_id` IS OLD.`variant_id` AND NEW.`basket_key` IS OLD.`basket_key` AND (NEW.`description` IS OLD.`description` OR NEW.`description` IS NULL) AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_age_checks'); END;

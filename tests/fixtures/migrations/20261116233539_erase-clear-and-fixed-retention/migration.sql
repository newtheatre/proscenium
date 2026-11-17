CREATE TABLE `seats_ticks` (
	`id` text PRIMARY KEY,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `seats_ledger` ADD `link_hash` text;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `seats_ledger_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `seats_ledger_append_only_delete` BEFORE DELETE ON `seats_ledger` BEGIN SELECT RAISE(ABORT, 'append-only: seats_ledger'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `seats_ledger_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `seats_ledger_append_only_update` BEFORE UPDATE ON `seats_ledger` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`quantity` IS OLD.`quantity` AND NEW.`buyer_id` IS OLD.`buyer_id` AND (NEW.`buyer_name` IS OLD.`buyer_name` OR NEW.`buyer_name` IS 'Former member') AND (NEW.`note` IS OLD.`note` OR NEW.`note` IS '[removed]') AND (NEW.`link_hash` IS OLD.`link_hash` OR NEW.`link_hash` IS NULL) AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: seats_ledger'); END;

CREATE TABLE `notify_notes` (
	`id` text PRIMARY KEY,
	`event_id` text NOT NULL UNIQUE,
	`performance_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seats_charges` (
	`id` text PRIMARY KEY,
	`amount` integer NOT NULL,
	`state` text NOT NULL,
	`provider_reference` text
);
--> statement-breakpoint
CREATE TABLE `seats_ledger` (
	`id` text PRIMARY KEY,
	`performance_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`buyer_id` text NOT NULL,
	`buyer_name` text,
	`note` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_seats_ledger_performance_id_seats_performances_id_fk` FOREIGN KEY (`performance_id`) REFERENCES `seats_performances`(`id`)
);
--> statement-breakpoint
CREATE TABLE `seats_performances` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`capacity` integer NOT NULL,
	`sold` integer DEFAULT 0 NOT NULL,
	`claimed_by` text,
	CONSTRAINT "seats_performances_capacity" CHECK("sold" <= "capacity")
);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `seats_ledger_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `seats_ledger_append_only_delete` BEFORE DELETE ON `seats_ledger` BEGIN SELECT RAISE(ABORT, 'append-only: seats_ledger'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `seats_ledger_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `seats_ledger_append_only_update` BEFORE UPDATE ON `seats_ledger` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`quantity` IS OLD.`quantity` AND NEW.`buyer_id` IS OLD.`buyer_id` AND (NEW.`buyer_name` IS OLD.`buyer_name` OR NEW.`buyer_name` IS 'Former member') AND (NEW.`note` IS OLD.`note` OR NEW.`note` IS '[removed]') AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: seats_ledger'); END;

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
	`link_hash` text,
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
	`starts_at` integer,
	`operating_day` text,
	`completed_at` integer,
	`category_id` text,
	CONSTRAINT `fk_seats_performances_category_id_core_terms_id_fk` FOREIGN KEY (`category_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "seats_performances_capacity" CHECK("sold" <= "capacity")
);
--> statement-breakpoint
CREATE TABLE `seats_ticks` (
	`id` text PRIMARY KEY,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snacks_sales` (
	`id` text PRIMARY KEY,
	`amount_minor` integer NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tickets_orders` (
	`id` text PRIMARY KEY,
	`amount_minor` integer NOT NULL,
	`deferred_minor` integer DEFAULT 0 NOT NULL,
	`performance_id` text,
	`state` text NOT NULL,
	`releases` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `seats_ledger_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `seats_ledger_append_only_delete` BEFORE DELETE ON `seats_ledger` BEGIN SELECT RAISE(ABORT, 'append-only: seats_ledger'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `seats_ledger_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `seats_ledger_append_only_update` BEFORE UPDATE ON `seats_ledger` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`quantity` IS OLD.`quantity` AND NEW.`buyer_id` IS OLD.`buyer_id` AND (NEW.`buyer_name` IS OLD.`buyer_name` OR NEW.`buyer_name` IS 'Former member') AND (NEW.`note` IS OLD.`note` OR NEW.`note` IS '[removed]') AND (NEW.`link_hash` IS OLD.`link_hash` OR NEW.`link_hash` IS NULL) AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: seats_ledger'); END;
--> statement-breakpoint
-- search-index: seats_ledger buyer_name,note
DROP TRIGGER IF EXISTS `seats_ledger_search_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `seats_ledger_search_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `seats_ledger_search_update`;
--> statement-breakpoint
DROP TABLE IF EXISTS `seats_ledger_search`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `seats_ledger_search` USING fts5(`buyer_name`, `note`, content='seats_ledger', content_rowid='rowid', tokenize='trigram remove_diacritics 1');
--> statement-breakpoint
INSERT INTO `seats_ledger_search` (`seats_ledger_search`, rank) VALUES ('secure-delete', 1);
--> statement-breakpoint
CREATE TRIGGER `seats_ledger_search_insert` AFTER INSERT ON `seats_ledger` BEGIN INSERT INTO `seats_ledger_search` (rowid, `buyer_name`, `note`) VALUES (new.rowid, new.`buyer_name`, new.`note`); END;
--> statement-breakpoint
CREATE TRIGGER `seats_ledger_search_delete` AFTER DELETE ON `seats_ledger` BEGIN INSERT INTO `seats_ledger_search` (`seats_ledger_search`, rowid, `buyer_name`, `note`) VALUES ('delete', old.rowid, old.`buyer_name`, old.`note`); END;
--> statement-breakpoint
CREATE TRIGGER `seats_ledger_search_update` AFTER UPDATE OF `buyer_name`, `note` ON `seats_ledger` BEGIN INSERT INTO `seats_ledger_search` (`seats_ledger_search`, rowid, `buyer_name`, `note`) VALUES ('delete', old.rowid, old.`buyer_name`, old.`note`); INSERT INTO `seats_ledger_search` (rowid, `buyer_name`, `note`) VALUES (new.rowid, new.`buyer_name`, new.`note`); END;
--> statement-breakpoint
INSERT INTO `seats_ledger_search` (`seats_ledger_search`) VALUES ('rebuild');
--> statement-breakpoint
-- search-index: seats_performances title
DROP TRIGGER IF EXISTS `seats_performances_search_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `seats_performances_search_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `seats_performances_search_update`;
--> statement-breakpoint
DROP TABLE IF EXISTS `seats_performances_search`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `seats_performances_search` USING fts5(`title`, content='seats_performances', content_rowid='rowid', tokenize='trigram remove_diacritics 1');
--> statement-breakpoint
INSERT INTO `seats_performances_search` (`seats_performances_search`, rank) VALUES ('secure-delete', 1);
--> statement-breakpoint
CREATE TRIGGER `seats_performances_search_insert` AFTER INSERT ON `seats_performances` BEGIN INSERT INTO `seats_performances_search` (rowid, `title`) VALUES (new.rowid, new.`title`); END;
--> statement-breakpoint
CREATE TRIGGER `seats_performances_search_delete` AFTER DELETE ON `seats_performances` BEGIN INSERT INTO `seats_performances_search` (`seats_performances_search`, rowid, `title`) VALUES ('delete', old.rowid, old.`title`); END;
--> statement-breakpoint
CREATE TRIGGER `seats_performances_search_update` AFTER UPDATE OF `title` ON `seats_performances` BEGIN INSERT INTO `seats_performances_search` (`seats_performances_search`, rowid, `title`) VALUES ('delete', old.rowid, old.`title`); INSERT INTO `seats_performances_search` (rowid, `title`) VALUES (new.rowid, new.`title`); END;
--> statement-breakpoint
INSERT INTO `seats_performances_search` (`seats_performances_search`) VALUES ('rebuild');

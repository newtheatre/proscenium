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

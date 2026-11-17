CREATE INDEX `core_accounts_name` ON `core_accounts` (`name`);
--> statement-breakpoint
-- search-index: core_account_emails address
DROP TRIGGER IF EXISTS `core_account_emails_search_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_account_emails_search_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_account_emails_search_update`;
--> statement-breakpoint
DROP TABLE IF EXISTS `core_account_emails_search`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `core_account_emails_search` USING fts5(`address`, content='core_account_emails', content_rowid='rowid', tokenize='trigram remove_diacritics 1');
--> statement-breakpoint
INSERT INTO `core_account_emails_search` (`core_account_emails_search`, rank) VALUES ('secure-delete', 1);
--> statement-breakpoint
CREATE TRIGGER `core_account_emails_search_insert` AFTER INSERT ON `core_account_emails` BEGIN INSERT INTO `core_account_emails_search` (rowid, `address`) VALUES (new.rowid, new.`address`); END;
--> statement-breakpoint
CREATE TRIGGER `core_account_emails_search_delete` AFTER DELETE ON `core_account_emails` BEGIN INSERT INTO `core_account_emails_search` (`core_account_emails_search`, rowid, `address`) VALUES ('delete', old.rowid, old.`address`); END;
--> statement-breakpoint
CREATE TRIGGER `core_account_emails_search_update` AFTER UPDATE OF `address` ON `core_account_emails` BEGIN INSERT INTO `core_account_emails_search` (`core_account_emails_search`, rowid, `address`) VALUES ('delete', old.rowid, old.`address`); INSERT INTO `core_account_emails_search` (rowid, `address`) VALUES (new.rowid, new.`address`); END;
--> statement-breakpoint
INSERT INTO `core_account_emails_search` (`core_account_emails_search`) VALUES ('rebuild');
--> statement-breakpoint
-- search-index: core_accounts name,preferred_name
DROP TRIGGER IF EXISTS `core_accounts_search_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_accounts_search_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_accounts_search_update`;
--> statement-breakpoint
DROP TABLE IF EXISTS `core_accounts_search`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `core_accounts_search` USING fts5(`name`, `preferred_name`, content='core_accounts', content_rowid='rowid', tokenize='trigram remove_diacritics 1');
--> statement-breakpoint
INSERT INTO `core_accounts_search` (`core_accounts_search`, rank) VALUES ('secure-delete', 1);
--> statement-breakpoint
CREATE TRIGGER `core_accounts_search_insert` AFTER INSERT ON `core_accounts` BEGIN INSERT INTO `core_accounts_search` (rowid, `name`, `preferred_name`) VALUES (new.rowid, new.`name`, new.`preferred_name`); END;
--> statement-breakpoint
CREATE TRIGGER `core_accounts_search_delete` AFTER DELETE ON `core_accounts` BEGIN INSERT INTO `core_accounts_search` (`core_accounts_search`, rowid, `name`, `preferred_name`) VALUES ('delete', old.rowid, old.`name`, old.`preferred_name`); END;
--> statement-breakpoint
CREATE TRIGGER `core_accounts_search_update` AFTER UPDATE OF `name`, `preferred_name` ON `core_accounts` BEGIN INSERT INTO `core_accounts_search` (`core_accounts_search`, rowid, `name`, `preferred_name`) VALUES ('delete', old.rowid, old.`name`, old.`preferred_name`); INSERT INTO `core_accounts_search` (rowid, `name`, `preferred_name`) VALUES (new.rowid, new.`name`, new.`preferred_name`); END;
--> statement-breakpoint
INSERT INTO `core_accounts_search` (`core_accounts_search`) VALUES ('rebuild');

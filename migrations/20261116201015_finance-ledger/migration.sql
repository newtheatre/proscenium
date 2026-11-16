CREATE TABLE `finance_accounts` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`module` text NOT NULL,
	`system_key` text,
	`scope` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "finance_accounts_kind" CHECK("kind" IN ('asset', 'liability', 'income', 'expense', 'equity'))
);
--> statement-breakpoint
CREATE TABLE `finance_entries` (
	`id` text PRIMARY KEY,
	`posting_id` text NOT NULL,
	`account_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`for_module` text,
	`production_id` text,
	`performance_id` text,
	`tax_code` text DEFAULT 'none' NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_finance_entries_posting_id_finance_postings_id_fk` FOREIGN KEY (`posting_id`) REFERENCES `finance_postings`(`id`),
	CONSTRAINT `fk_finance_entries_account_id_finance_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`),
	CONSTRAINT "finance_entries_amount" CHECK("amount_minor" <> 0),
	CONSTRAINT "finance_entries_tax" CHECK("tax_code" <> 'none' OR "tax_minor" = 0)
);
--> statement-breakpoint
CREATE TABLE `finance_period_closes` (
	`id` text PRIMARY KEY,
	`period_id` text NOT NULL,
	`action` text NOT NULL,
	`by` text,
	`at` integer NOT NULL,
	`debits_minor` integer NOT NULL,
	`credits_minor` integer NOT NULL,
	`reason_term_id` text,
	CONSTRAINT `fk_finance_period_closes_period_id_finance_periods_id_fk` FOREIGN KEY (`period_id`) REFERENCES `finance_periods`(`id`),
	CONSTRAINT `fk_finance_period_closes_reason_term_id_core_terms_id_fk` FOREIGN KEY (`reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "finance_period_closes_action" CHECK("action" IN ('close', 'reopen')),
	CONSTRAINT "finance_period_closes_reason" CHECK("action" = 'close' OR "reason_term_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `finance_periods` (
	`id` text PRIMARY KEY,
	`label` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "finance_periods_order" CHECK("ends_on" >= "starts_on")
);
--> statement-breakpoint
CREATE TABLE `finance_postings` (
	`id` text PRIMARY KEY,
	`idempotency_key` text NOT NULL,
	`source_module` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`kind` text NOT NULL,
	`reverses_id` text,
	`period_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`posted_at` integer NOT NULL,
	`posted_by` text,
	CONSTRAINT `fk_finance_postings_period_id_finance_periods_id_fk` FOREIGN KEY (`period_id`) REFERENCES `finance_periods`(`id`),
	CONSTRAINT "finance_postings_kind" CHECK("kind" IN ('sale', 'refund', 'fee', 'payout', 'recognition', 'transfer', 'cash_variance', 'unfulfilled', 'correction', 'opening'))
);
--> statement-breakpoint
CREATE TABLE `finance_seals` (
	`posting_id` text NOT NULL,
	`entry_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_finance_seals_posting_id_finance_postings_id_fk` FOREIGN KEY (`posting_id`) REFERENCES `finance_postings`(`id`),
	CONSTRAINT "finance_seals_entry_count" CHECK("entry_count" >= 2)
);
--> statement-breakpoint
CREATE TABLE `finance_tax_codes` (
	`code` text PRIMARY KEY,
	`label` text NOT NULL,
	`rate_basis_points` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	CONSTRAINT "finance_tax_codes_rate" CHECK("rate_basis_points" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_accounts_code` ON `finance_accounts` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_accounts_system_key` ON `finance_accounts` (`system_key`,coalesce("scope", '')) WHERE system_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX `finance_entries_posting` ON `finance_entries` (`posting_id`);--> statement-breakpoint
CREATE INDEX `finance_entries_account` ON `finance_entries` (`account_id`);--> statement-breakpoint
CREATE INDEX `finance_entries_production` ON `finance_entries` (`production_id`) WHERE production_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `finance_entries_performance` ON `finance_entries` (`performance_id`) WHERE performance_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `finance_period_closes_period` ON `finance_period_closes` (`period_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_periods_starts_on` ON `finance_periods` (`starts_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_postings_idempotency_key` ON `finance_postings` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_postings_reverses` ON `finance_postings` (`reverses_id`) WHERE reverses_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `finance_postings_period` ON `finance_postings` (`period_id`);--> statement-breakpoint
CREATE INDEX `finance_postings_source` ON `finance_postings` (`source_module`,`source_type`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_seals_posting` ON `finance_seals` (`posting_id`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_postings_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `finance_postings_append_only_delete` BEFORE DELETE ON `finance_postings` BEGIN SELECT RAISE(ABORT, 'append-only: finance_postings'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_postings_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `finance_postings_append_only_update` BEFORE UPDATE ON `finance_postings` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`idempotency_key` IS OLD.`idempotency_key` AND NEW.`source_module` IS OLD.`source_module` AND NEW.`source_type` IS OLD.`source_type` AND NEW.`source_id` IS OLD.`source_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`reverses_id` IS OLD.`reverses_id` AND NEW.`period_id` IS OLD.`period_id` AND NEW.`occurred_at` IS OLD.`occurred_at` AND NEW.`posted_at` IS OLD.`posted_at` AND NEW.`posted_by` IS OLD.`posted_by`) BEGIN SELECT RAISE(ABORT, 'append-only: finance_postings'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_entries_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `finance_entries_append_only_delete` BEFORE DELETE ON `finance_entries` BEGIN SELECT RAISE(ABORT, 'append-only: finance_entries'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_entries_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `finance_entries_append_only_update` BEFORE UPDATE ON `finance_entries` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`posting_id` IS OLD.`posting_id` AND NEW.`account_id` IS OLD.`account_id` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`currency` IS OLD.`currency` AND NEW.`for_module` IS OLD.`for_module` AND NEW.`production_id` IS OLD.`production_id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`tax_code` IS OLD.`tax_code` AND NEW.`tax_minor` IS OLD.`tax_minor` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: finance_entries'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_seals_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `finance_seals_append_only_delete` BEFORE DELETE ON `finance_seals` BEGIN SELECT RAISE(ABORT, 'append-only: finance_seals'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_seals_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `finance_seals_append_only_update` BEFORE UPDATE ON `finance_seals` WHEN NOT (NEW.`posting_id` IS OLD.`posting_id` AND NEW.`entry_count` IS OLD.`entry_count` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: finance_seals'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_period_closes_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `finance_period_closes_append_only_delete` BEFORE DELETE ON `finance_period_closes` BEGIN SELECT RAISE(ABORT, 'append-only: finance_period_closes'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_period_closes_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `finance_period_closes_append_only_update` BEFORE UPDATE ON `finance_period_closes` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`period_id` IS OLD.`period_id` AND NEW.`action` IS OLD.`action` AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at` AND NEW.`debits_minor` IS OLD.`debits_minor` AND NEW.`credits_minor` IS OLD.`credits_minor` AND NEW.`reason_term_id` IS OLD.`reason_term_id`) BEGIN SELECT RAISE(ABORT, 'append-only: finance_period_closes'); END;
--> statement-breakpoint
-- Written by hand: the ledger's own rules (Box office specification, part 2, Finance). A posting is
-- real only once sealed, and the seal is refused unless its entries balance in one currency.
CREATE TRIGGER `finance_seals_balance` BEFORE INSERT ON `finance_seals` WHEN (SELECT count(*) FROM `finance_entries` WHERE `posting_id` = NEW.`posting_id`) <> NEW.`entry_count` OR (SELECT coalesce(sum(`amount_minor`), 0) FROM `finance_entries` WHERE `posting_id` = NEW.`posting_id`) <> 0 OR (SELECT count(DISTINCT `currency`) FROM `finance_entries` WHERE `posting_id` = NEW.`posting_id`) <> 1 BEGIN SELECT RAISE(ABORT, 'finance: a posting must balance to zero in one currency, with every entry counted, before it is sealed'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_entries_after_seal` BEFORE INSERT ON `finance_entries` WHEN EXISTS (SELECT 1 FROM `finance_seals` WHERE `posting_id` = NEW.`posting_id`) BEGIN SELECT RAISE(ABORT, 'finance: a sealed posting takes no more entries'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_postings_open_period` BEFORE INSERT ON `finance_postings` WHEN coalesce((SELECT `action` FROM `finance_period_closes` WHERE `period_id` = NEW.`period_id` ORDER BY `at` DESC, `id` DESC LIMIT 1), 'reopen') = 'close' BEGIN SELECT RAISE(ABORT, 'finance: nothing is posted into a closed period'); END;
--> statement-breakpoint
-- A module posts only to its own accounts. Payments may write the entries an owner returned for its
-- part of a payment, marked with for_module. Finance's own corrections and opening balances may
-- reach any account. A retired account takes nothing new, except a reversal.
CREATE TRIGGER `finance_entries_account_module` BEFORE INSERT ON `finance_entries` WHEN NOT EXISTS (SELECT 1 FROM `finance_postings` p JOIN `finance_accounts` a ON a.`id` = NEW.`account_id` WHERE p.`id` = NEW.`posting_id` AND (NEW.`for_module` IS NULL OR NEW.`for_module` = p.`source_module` OR p.`source_module` = 'payments') AND (a.`module` = coalesce(NEW.`for_module`, p.`source_module`) OR (p.`source_module` = 'finance' AND p.`kind` IN ('correction', 'opening'))) AND (a.`active` = 1 OR p.`reverses_id` IS NOT NULL)) BEGIN SELECT RAISE(ABORT, 'finance: a module posts only to its own active accounts'); END;
--> statement-breakpoint
-- Closing follows the period's order and its state: a close follows an open period whose earlier
-- periods are all closed, with debits equal to credits; a reopen follows a close.
CREATE TRIGGER `finance_period_closes_order` BEFORE INSERT ON `finance_period_closes` WHEN (NEW.`action` = 'close') = (coalesce((SELECT `action` FROM `finance_period_closes` WHERE `period_id` = NEW.`period_id` ORDER BY `at` DESC, `id` DESC LIMIT 1), 'reopen') = 'close') OR (NEW.`action` = 'close' AND (NEW.`debits_minor` <> NEW.`credits_minor` OR EXISTS (SELECT 1 FROM `finance_periods` e WHERE e.`starts_on` < (SELECT `starts_on` FROM `finance_periods` WHERE `id` = NEW.`period_id`) AND coalesce((SELECT `action` FROM `finance_period_closes` c WHERE c.`period_id` = e.`id` ORDER BY c.`at` DESC, c.`id` DESC LIMIT 1), 'reopen') <> 'close'))) BEGIN SELECT RAISE(ABORT, 'finance: a period closes after every earlier period, with debits equal to credits, and reopens only once closed'); END;
--> statement-breakpoint
-- The first release has one tax code, and it always exists.
INSERT INTO `finance_tax_codes` (`code`, `label`, `rate_basis_points`, `active`) VALUES ('none', 'No tax', 0, 1);

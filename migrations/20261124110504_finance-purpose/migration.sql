ALTER TABLE `finance_entries` ADD `budget_line_id` text;--> statement-breakpoint
ALTER TABLE `finance_postings` ADD `purpose` text;--> statement-breakpoint
CREATE INDEX `finance_entries_budget_line` ON `finance_entries` (`budget_line_id`) WHERE budget_line_id IS NOT NULL;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_postings_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `finance_postings_append_only_delete` BEFORE DELETE ON `finance_postings` BEGIN SELECT RAISE(ABORT, 'append-only: finance_postings'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_postings_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `finance_postings_append_only_update` BEFORE UPDATE ON `finance_postings` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`idempotency_key` IS OLD.`idempotency_key` AND NEW.`source_module` IS OLD.`source_module` AND NEW.`source_type` IS OLD.`source_type` AND NEW.`source_id` IS OLD.`source_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`reverses_id` IS OLD.`reverses_id` AND NEW.`period_id` IS OLD.`period_id` AND NEW.`occurred_at` IS OLD.`occurred_at` AND NEW.`posted_at` IS OLD.`posted_at` AND NEW.`posted_by` IS OLD.`posted_by` AND NEW.`purpose` IS OLD.`purpose`) BEGIN SELECT RAISE(ABORT, 'append-only: finance_postings'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_entries_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `finance_entries_append_only_delete` BEFORE DELETE ON `finance_entries` BEGIN SELECT RAISE(ABORT, 'append-only: finance_entries'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_entries_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `finance_entries_append_only_update` BEFORE UPDATE ON `finance_entries` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`posting_id` IS OLD.`posting_id` AND NEW.`account_id` IS OLD.`account_id` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`currency` IS OLD.`currency` AND NEW.`for_module` IS OLD.`for_module` AND NEW.`production_id` IS OLD.`production_id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`tax_code` IS OLD.`tax_code` AND NEW.`tax_minor` IS OLD.`tax_minor` AND NEW.`budget_line_id` IS OLD.`budget_line_id` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: finance_entries'); END;
--> statement-breakpoint
-- Written by hand (F-A1): Invoices, like Payments, may write the entries an owner returned for its line.
DROP TRIGGER IF EXISTS `finance_entries_account_module`;
--> statement-breakpoint
CREATE TRIGGER `finance_entries_account_module` BEFORE INSERT ON `finance_entries` WHEN NOT EXISTS (SELECT 1 FROM `finance_postings` p JOIN `finance_accounts` a ON a.`id` = NEW.`account_id` WHERE p.`id` = NEW.`posting_id` AND (NEW.`for_module` IS NULL OR NEW.`for_module` = p.`source_module` OR p.`source_module` IN ('payments', 'invoicing')) AND (a.`module` = coalesce(NEW.`for_module`, p.`source_module`) OR (p.`source_module` = 'finance' AND p.`kind` IN ('correction', 'opening'))) AND (a.`active` = 1 OR p.`reverses_id` IS NOT NULL)) BEGIN SELECT RAISE(ABORT, 'finance: a module posts only to its own active accounts'); END;

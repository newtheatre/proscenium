ALTER TABLE `finance_tax_codes` ADD `in_scope` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `finance_entries_tax_code` ON `finance_entries` (`tax_code`) WHERE tax_code <> 'none';--> statement-breakpoint
-- Written by hand (F-A2): the VAT codes beside none. none and outside are not on a VAT return.
UPDATE `finance_tax_codes` SET `in_scope` = 0 WHERE `code` = 'none';
--> statement-breakpoint
INSERT OR IGNORE INTO `finance_tax_codes` (`code`, `label`, `rate_basis_points`, `active`, `in_scope`) VALUES
	('standard', 'Standard rate', 2000, 1, 1),
	('reduced', 'Reduced rate', 500, 1, 1),
	('zero', 'Zero rate', 0, 1, 1),
	('exempt', 'Exempt', 0, 1, 1),
	('outside', 'Outside the scope of VAT', 0, 1, 0);
--> statement-breakpoint
-- A used code keeps its code, rate and scope, and is never deleted; none never changes them at all.
CREATE TRIGGER `finance_tax_codes_fixed` BEFORE UPDATE ON `finance_tax_codes` WHEN (NEW.`code` IS NOT OLD.`code` OR NEW.`rate_basis_points` IS NOT OLD.`rate_basis_points` OR NEW.`in_scope` IS NOT OLD.`in_scope`) AND (OLD.`code` = 'none' OR EXISTS (SELECT 1 FROM `finance_entries` WHERE `tax_code` = OLD.`code`)) BEGIN SELECT RAISE(ABORT, 'finance: a tax code keeps its rate once used; add a new code instead'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_tax_codes_kept` BEFORE DELETE ON `finance_tax_codes` WHEN OLD.`code` = 'none' OR EXISTS (SELECT 1 FROM `finance_entries` WHERE `tax_code` = OLD.`code`) BEGIN SELECT RAISE(ABORT, 'finance: a tax code in use is never deleted'); END;

CREATE TABLE `payments_disbursements` (
	`id` text PRIMARY KEY,
	`method` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`owner_module` text NOT NULL,
	`owner_record` text NOT NULL,
	`payee_id` text,
	`paid_on` text NOT NULL,
	`reference` text,
	`reverses_id` text,
	`posting_id` text NOT NULL,
	`by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_payments_disbursements_payee_id_payments_payees_id_fk` FOREIGN KEY (`payee_id`) REFERENCES `payments_payees`(`id`),
	CONSTRAINT "payments_disbursements_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "payments_disbursements_method" CHECK("method" IN ('bank-transfer', 'cheque', 'theatre-card', 'petty-cash', 'parent-body')),
	CONSTRAINT "payments_disbursements_reference" CHECK("reference" IS NULL OR length("reference") <= 40)
);
--> statement-breakpoint
CREATE TABLE `payments_payees` (
	`id` text PRIMARY KEY,
	`party_module` text NOT NULL,
	`party_id` text NOT NULL,
	`account_id` text,
	`account_name` text,
	`sort_code` text,
	`account_number` text,
	`last_digits` text,
	`last_used_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_disbursements_reverses` ON `payments_disbursements` (`reverses_id`) WHERE reverses_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_disbursements_owner` ON `payments_disbursements` (`owner_module`,`owner_record`);--> statement-breakpoint
CREATE INDEX `payments_disbursements_paid` ON `payments_disbursements` (`paid_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_payees_party` ON `payments_payees` (`party_module`,`party_id`);--> statement-breakpoint
CREATE INDEX `payments_payees_account` ON `payments_payees` (`account_id`) WHERE account_id IS NOT NULL;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `payments_disbursements_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `payments_disbursements_append_only_delete` BEFORE DELETE ON `payments_disbursements` BEGIN SELECT RAISE(ABORT, 'append-only: payments_disbursements'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `payments_disbursements_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `payments_disbursements_append_only_update` BEFORE UPDATE ON `payments_disbursements` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`method` IS OLD.`method` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`currency` IS OLD.`currency` AND NEW.`owner_module` IS OLD.`owner_module` AND NEW.`owner_record` IS OLD.`owner_record` AND NEW.`payee_id` IS OLD.`payee_id` AND NEW.`paid_on` IS OLD.`paid_on` AND NEW.`reference` IS OLD.`reference` AND NEW.`reverses_id` IS OLD.`reverses_id` AND NEW.`posting_id` IS OLD.`posting_id` AND NEW.`by` IS OLD.`by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: payments_disbursements'); END;

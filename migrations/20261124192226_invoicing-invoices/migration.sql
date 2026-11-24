CREATE TABLE `invoicing_allocations` (
	`id` text PRIMARY KEY,
	`invoice_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`reverses_id` text,
	`intent_id` text,
	`disbursement_id` text,
	`credit_note_id` text,
	`posting_id` text,
	`on_date` text NOT NULL,
	`by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_invoicing_allocations_invoice_id_invoicing_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoicing_invoices`(`id`),
	CONSTRAINT "invoicing_allocations_kind" CHECK("kind" IN ('payment', 'credit', 'write_off', 'reversal')),
	CONSTRAINT "invoicing_allocations_amount" CHECK("amount_minor" <> 0 AND ("amount_minor" > 0) = ("kind" <> 'reversal')),
	CONSTRAINT "invoicing_allocations_one_source" CHECK(("intent_id" IS NOT NULL) + ("disbursement_id" IS NOT NULL) + ("credit_note_id" IS NOT NULL) + ("posting_id" IS NOT NULL) + ("reverses_id" IS NOT NULL) = 1)
);
--> statement-breakpoint
CREATE TABLE `invoicing_invoices` (
	`id` text PRIMARY KEY,
	`direction` text NOT NULL,
	`kind` text NOT NULL,
	`credits_id` text,
	`series_id` text,
	`number` text,
	`party_module` text,
	`party_id` text,
	`party_account_id` text,
	`bill_to_name` text NOT NULL,
	`bill_to_address` text DEFAULT '' NOT NULL,
	`bill_to_email` text,
	`tax_number` text DEFAULT '' NOT NULL,
	`seller_tax_number` text,
	`reference` text DEFAULT '' NOT NULL,
	`issue_on` text,
	`due_on` text,
	`supplied_on` text,
	`currency` text NOT NULL,
	`net_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`allocated_minor` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`internal_note` text DEFAULT '' NOT NULL,
	`source_module` text,
	`source_type` text,
	`source_id` text,
	`owner_module` text,
	`pdf_file_id` text,
	`posting_id` text,
	`pay_token_hash` text,
	`pay_token_expires_at` integer,
	`reminders_on` integer DEFAULT true NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`issued_by` text,
	`issued_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_invoicing_invoices_series_id_invoicing_series_id_fk` FOREIGN KEY (`series_id`) REFERENCES `invoicing_series`(`id`),
	CONSTRAINT `fk_invoicing_invoices_pdf_file_id_core_files_id_fk` FOREIGN KEY (`pdf_file_id`) REFERENCES `core_files`(`id`),
	CONSTRAINT "invoicing_invoices_direction" CHECK("direction" IN ('out', 'in')),
	CONSTRAINT "invoicing_invoices_kind" CHECK("kind" IN ('invoice', 'credit_note')),
	CONSTRAINT "invoicing_invoices_credits_kind" CHECK(("kind" = 'credit_note') = ("credits_id" IS NOT NULL)),
	CONSTRAINT "invoicing_invoices_series_out" CHECK("direction" = 'in' OR "series_id" IS NOT NULL),
	CONSTRAINT "invoicing_invoices_state" CHECK("state" IN ('draft', 'submitted', 'open', 'closed')),
	CONSTRAINT "invoicing_invoices_issued" CHECK("state" IN ('draft', 'submitted') OR ("number" IS NOT NULL AND "issue_on" IS NOT NULL AND "due_on" IS NOT NULL AND "posting_id" IS NOT NULL)),
	CONSTRAINT "invoicing_invoices_due" CHECK("due_on" IS NULL OR "issue_on" IS NULL OR "due_on" >= "issue_on"),
	CONSTRAINT "invoicing_invoices_party_pair" CHECK(("party_module" IS NULL) = ("party_id" IS NULL)),
	CONSTRAINT "invoicing_invoices_name" CHECK(length("bill_to_name") BETWEEN 1 AND 120),
	CONSTRAINT "invoicing_invoices_address" CHECK(length("bill_to_address") <= 400),
	CONSTRAINT "invoicing_invoices_tax_number" CHECK(length("tax_number") <= 30),
	CONSTRAINT "invoicing_invoices_reference" CHECK(length("reference") <= 60),
	CONSTRAINT "invoicing_invoices_notes" CHECK(length("notes") <= 1000 AND length("internal_note") <= 1000),
	CONSTRAINT "invoicing_invoices_amounts" CHECK("net_minor" >= 0 AND "tax_minor" >= 0 AND "total_minor" = "net_minor" + "tax_minor"),
	CONSTRAINT "invoicing_invoices_allocated" CHECK("allocated_minor" BETWEEN 0 AND "total_minor"),
	CONSTRAINT "invoicing_invoices_source_set" CHECK(("source_module" IS NULL) = ("source_id" IS NULL) AND ("source_type" IS NULL) = ("source_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `invoicing_lines` (
	`id` text PRIMARY KEY,
	`invoice_id` text NOT NULL,
	`position` integer NOT NULL,
	`description` text NOT NULL,
	`quantity_milli` integer NOT NULL,
	`unit_minor` integer NOT NULL,
	`net_minor` integer NOT NULL,
	`tax_code` text DEFAULT 'none' NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`tax_rate_bp` integer DEFAULT 0 NOT NULL,
	`account_id` text,
	`owner_key` text,
	`production_id` text,
	`performance_id` text,
	`budget_line_id` text,
	`budget_request_id` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_invoicing_lines_invoice_id_invoicing_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoicing_invoices`(`id`),
	CONSTRAINT `fk_invoicing_lines_account_id_finance_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`),
	CONSTRAINT "invoicing_lines_description" CHECK(length("description") BETWEEN 1 AND 300),
	CONSTRAINT "invoicing_lines_quantity" CHECK("quantity_milli" BETWEEN 1 AND 1000000000),
	CONSTRAINT "invoicing_lines_amounts" CHECK("unit_minor" >= 0 AND "net_minor" >= 0 AND "tax_minor" >= 0),
	CONSTRAINT "invoicing_lines_none" CHECK("tax_code" <> 'none' OR "tax_minor" = 0),
	CONSTRAINT "invoicing_lines_rate" CHECK("tax_rate_bp" BETWEEN 0 AND 10000),
	CONSTRAINT "invoicing_lines_account" CHECK("owner_key" IS NOT NULL OR "account_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `invoicing_parties` (
	`id` text PRIMARY KEY,
	`party_module` text NOT NULL,
	`party_id` text NOT NULL,
	`account_id` text,
	`terms_days` integer,
	`standing_reference` text DEFAULT '' NOT NULL,
	`default_account_id` text,
	`default_tax_code` text,
	`send_reminders` integer DEFAULT true NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_invoicing_parties_default_account_id_finance_accounts_id_fk` FOREIGN KEY (`default_account_id`) REFERENCES `finance_accounts`(`id`),
	CONSTRAINT "invoicing_parties_module" CHECK("party_module" IN ('companies', 'core')),
	CONSTRAINT "invoicing_parties_terms" CHECK("terms_days" IS NULL OR "terms_days" BETWEEN 0 AND 120),
	CONSTRAINT "invoicing_parties_reference" CHECK(length("standing_reference") <= 60),
	CONSTRAINT "invoicing_parties_address" CHECK(length("address") <= 400),
	CONSTRAINT "invoicing_parties_note" CHECK(length("note") <= 500)
);
--> statement-breakpoint
CREATE TABLE `invoicing_series` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`pad` integer DEFAULT 4 NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "invoicing_series_name" CHECK(length("name") BETWEEN 1 AND 60),
	CONSTRAINT "invoicing_series_kind" CHECK("kind" IN ('invoice', 'credit_note')),
	CONSTRAINT "invoicing_series_prefix" CHECK(length("prefix") <= 12 AND "prefix" NOT GLOB '*[^A-Za-z0-9/-]*'),
	CONSTRAINT "invoicing_series_pad" CHECK("pad" BETWEEN 1 AND 8),
	CONSTRAINT "invoicing_series_next" CHECK("next_number" >= 1)
);
--> statement-breakpoint
CREATE INDEX `invoicing_allocations_invoice` ON `invoicing_allocations` (`invoice_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `invoicing_allocations_reverses` ON `invoicing_allocations` (`reverses_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoicing_invoices_number` ON `invoicing_invoices` (`direction`,`number`) WHERE direction = 'out' AND number IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `invoicing_invoices_supplier_number` ON `invoicing_invoices` (`party_module`,`party_id`,`number`) WHERE direction = 'in' AND number IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `invoicing_invoices_posting` ON `invoicing_invoices` (`posting_id`) WHERE posting_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `invoicing_invoices_state` ON `invoicing_invoices` (`state`,`due_on`);--> statement-breakpoint
CREATE INDEX `invoicing_invoices_source` ON `invoicing_invoices` (`source_module`,`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `invoicing_invoices_party` ON `invoicing_invoices` (`party_module`,`party_id`);--> statement-breakpoint
CREATE INDEX `invoicing_invoices_credits` ON `invoicing_invoices` (`credits_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoicing_lines_position` ON `invoicing_lines` (`invoice_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoicing_parties_party` ON `invoicing_parties` (`party_module`,`party_id`);--> statement-breakpoint
CREATE INDEX `invoicing_parties_account` ON `invoicing_parties` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoicing_series_default` ON `invoicing_series` (`kind`) WHERE is_default = 1;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `invoicing_allocations_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `invoicing_allocations_append_only_delete` BEFORE DELETE ON `invoicing_allocations` BEGIN SELECT RAISE(ABORT, 'append-only: invoicing_allocations'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `invoicing_allocations_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `invoicing_allocations_append_only_update` BEFORE UPDATE ON `invoicing_allocations` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`invoice_id` IS OLD.`invoice_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`reverses_id` IS OLD.`reverses_id` AND NEW.`intent_id` IS OLD.`intent_id` AND NEW.`disbursement_id` IS OLD.`disbursement_id` AND NEW.`credit_note_id` IS OLD.`credit_note_id` AND NEW.`posting_id` IS OLD.`posting_id` AND NEW.`on_date` IS OLD.`on_date` AND NEW.`by` IS OLD.`by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: invoicing_allocations'); END;

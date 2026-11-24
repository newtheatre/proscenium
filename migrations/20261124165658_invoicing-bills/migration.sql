ALTER TABLE `invoicing_invoices` ADD `returned_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invoicing_invoices` (
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
	`returned_note` text DEFAULT '' NOT NULL,
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
	CONSTRAINT "invoicing_invoices_returned" CHECK(length("returned_note") <= 500),
	CONSTRAINT "invoicing_invoices_amounts" CHECK("net_minor" >= 0 AND "tax_minor" >= 0 AND "total_minor" = "net_minor" + "tax_minor"),
	CONSTRAINT "invoicing_invoices_allocated" CHECK("allocated_minor" BETWEEN 0 AND "total_minor"),
	CONSTRAINT "invoicing_invoices_source_set" CHECK(("source_module" IS NULL) = ("source_id" IS NULL) AND ("source_type" IS NULL) = ("source_id" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_invoicing_invoices`(`id`, `direction`, `kind`, `credits_id`, `series_id`, `number`, `party_module`, `party_id`, `party_account_id`, `bill_to_name`, `bill_to_address`, `bill_to_email`, `tax_number`, `seller_tax_number`, `reference`, `issue_on`, `due_on`, `supplied_on`, `currency`, `net_minor`, `tax_minor`, `total_minor`, `allocated_minor`, `state`, `notes`, `internal_note`, `source_module`, `source_type`, `source_id`, `owner_module`, `pdf_file_id`, `posting_id`, `pay_token_hash`, `pay_token_expires_at`, `reminders_on`, `version`, `created_by`, `issued_by`, `issued_at`, `created_at`, `updated_at`) SELECT `id`, `direction`, `kind`, `credits_id`, `series_id`, `number`, `party_module`, `party_id`, `party_account_id`, `bill_to_name`, `bill_to_address`, `bill_to_email`, `tax_number`, `seller_tax_number`, `reference`, `issue_on`, `due_on`, `supplied_on`, `currency`, `net_minor`, `tax_minor`, `total_minor`, `allocated_minor`, `state`, `notes`, `internal_note`, `source_module`, `source_type`, `source_id`, `owner_module`, `pdf_file_id`, `posting_id`, `pay_token_hash`, `pay_token_expires_at`, `reminders_on`, `version`, `created_by`, `issued_by`, `issued_at`, `created_at`, `updated_at` FROM `invoicing_invoices`;--> statement-breakpoint
DROP TABLE `invoicing_invoices`;--> statement-breakpoint
ALTER TABLE `__new_invoicing_invoices` RENAME TO `invoicing_invoices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `invoicing_invoices_number` ON `invoicing_invoices` (`direction`,`number`) WHERE direction = 'out' AND number IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `invoicing_invoices_supplier_number` ON `invoicing_invoices` (`party_module`,`party_id`,`number`) WHERE direction = 'in' AND number IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `invoicing_invoices_posting` ON `invoicing_invoices` (`posting_id`) WHERE posting_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `invoicing_invoices_state` ON `invoicing_invoices` (`state`,`due_on`);--> statement-breakpoint
CREATE INDEX `invoicing_invoices_source` ON `invoicing_invoices` (`source_module`,`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `invoicing_invoices_party` ON `invoicing_invoices` (`party_module`,`party_id`);--> statement-breakpoint
CREATE INDEX `invoicing_invoices_credits` ON `invoicing_invoices` (`credits_id`);
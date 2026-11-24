CREATE TABLE `budgets_claim_events` (
	`id` text PRIMARY KEY,
	`claim_id` text NOT NULL,
	`action` text NOT NULL,
	`by` text,
	`at` integer NOT NULL,
	`amount_minor` integer,
	`note` text,
	`disbursement_id` text,
	`posting_id` text,
	CONSTRAINT `fk_budgets_claim_events_claim_id_budgets_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `budgets_claims`(`id`),
	CONSTRAINT "budgets_claim_events_action" CHECK("action" IN ('submitted', 'returned', 'resubmitted', 'approved', 'declined', 'withdrawn', 'voided', 'paid', 'payment-reversed')),
	CONSTRAINT "budgets_claim_events_note" CHECK("note" IS NULL OR length("note") <= 500)
);
--> statement-breakpoint
CREATE TABLE `budgets_claim_items` (
	`id` text PRIMARY KEY,
	`claim_id` text NOT NULL,
	`spent_on` text NOT NULL,
	`description` text NOT NULL,
	`supplier` text,
	`amount_minor` integer NOT NULL,
	`line_id` text,
	`category_id` text,
	`no_receipt_reason` text,
	`approved_minor` integer,
	`part_reason` text,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_budgets_claim_items_claim_id_budgets_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `budgets_claims`(`id`),
	CONSTRAINT `fk_budgets_claim_items_line_id_budgets_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `budgets_lines`(`id`),
	CONSTRAINT `fk_budgets_claim_items_category_id_budgets_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `budgets_categories`(`id`),
	CONSTRAINT "budgets_claim_items_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "budgets_claim_items_approved" CHECK("approved_minor" IS NULL OR "approved_minor" BETWEEN 0 AND "amount_minor"),
	CONSTRAINT "budgets_claim_items_part" CHECK("approved_minor" IS NULL OR "approved_minor" = "amount_minor" OR "part_reason" IS NOT NULL),
	CONSTRAINT "budgets_claim_items_description" CHECK(length("description") <= 200),
	CONSTRAINT "budgets_claim_items_supplier" CHECK("supplier" IS NULL OR length("supplier") <= 80),
	CONSTRAINT "budgets_claim_items_reason" CHECK("no_receipt_reason" IS NULL OR length("no_receipt_reason") <= 300),
	CONSTRAINT "budgets_claim_items_part_reason" CHECK("part_reason" IS NULL OR length("part_reason") <= 300)
);
--> statement-breakpoint
CREATE TABLE `budgets_claims` (
	`id` text PRIMARY KEY,
	`number` text,
	`claimant_id` text,
	`request_id` text,
	`title` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`currency` text NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`approved_minor` integer,
	`paid_minor` integer DEFAULT 0 NOT NULL,
	`pay_route` text NOT NULL,
	`declared_at` integer,
	`submitted_at` integer,
	`decided_at` integer,
	`expense_posting_id` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_budgets_claims_request_id_budgets_spending_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `budgets_spending_requests`(`id`),
	CONSTRAINT "budgets_claims_state" CHECK("state" IN ('draft', 'submitted', 'returned', 'approved', 'declined', 'withdrawn', 'voided', 'paid')),
	CONSTRAINT "budgets_claims_route" CHECK("pay_route" IN ('bank-transfer', 'parent-body', 'cash', 'cheque')),
	CONSTRAINT "budgets_claims_title" CHECK(length("title") <= 80),
	CONSTRAINT "budgets_claims_total" CHECK("total_minor" >= 0),
	CONSTRAINT "budgets_claims_paid" CHECK("paid_minor" >= 0 AND "paid_minor" <= coalesce("approved_minor", 0)),
	CONSTRAINT "budgets_claims_numbered" CHECK("state" IN ('draft', 'withdrawn') OR "number" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `budgets_counters` (
	`year_starts_on` text PRIMARY KEY,
	`next_number` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `budgets_claim_events_claim` ON `budgets_claim_events` (`claim_id`,`at`);--> statement-breakpoint
CREATE INDEX `budgets_claim_items_claim` ON `budgets_claim_items` (`claim_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `budgets_claim_items_line` ON `budgets_claim_items` (`line_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_claims_number` ON `budgets_claims` (`number`) WHERE number IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_claims_posting` ON `budgets_claims` (`expense_posting_id`) WHERE expense_posting_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `budgets_claims_claimant` ON `budgets_claims` (`claimant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `budgets_claims_state` ON `budgets_claims` (`state`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `budgets_claims_request` ON `budgets_claims` (`request_id`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `budgets_claim_events_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `budgets_claim_events_append_only_delete` BEFORE DELETE ON `budgets_claim_events` BEGIN SELECT RAISE(ABORT, 'append-only: budgets_claim_events'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `budgets_claim_events_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `budgets_claim_events_append_only_update` BEFORE UPDATE ON `budgets_claim_events` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`claim_id` IS OLD.`claim_id` AND NEW.`action` IS OLD.`action` AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at` AND NEW.`amount_minor` IS OLD.`amount_minor` AND (NEW.`note` IS OLD.`note` OR NEW.`note` IS NULL) AND NEW.`disbursement_id` IS OLD.`disbursement_id` AND NEW.`posting_id` IS OLD.`posting_id`) BEGIN SELECT RAISE(ABORT, 'append-only: budgets_claim_events'); END;

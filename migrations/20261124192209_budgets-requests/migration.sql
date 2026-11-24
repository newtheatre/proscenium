CREATE TABLE `budgets_spending_requests` (
	`id` text PRIMARY KEY,
	`requested_by` text,
	`line_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`description` text NOT NULL,
	`needed_by` text,
	`state` text NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`decision_note` text,
	`fulfilled_minor` integer DEFAULT 0 NOT NULL,
	`lapses_on` text,
	`source_module` text,
	`source_type` text,
	`source_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_budgets_spending_requests_line_id_budgets_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `budgets_lines`(`id`),
	CONSTRAINT "budgets_spending_requests_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "budgets_spending_requests_fulfilled" CHECK("fulfilled_minor" BETWEEN 0 AND "amount_minor"),
	CONSTRAINT "budgets_spending_requests_description" CHECK(length("description") <= 500),
	CONSTRAINT "budgets_spending_requests_note" CHECK("decision_note" IS NULL OR length("decision_note") <= 500),
	CONSTRAINT "budgets_spending_requests_state" CHECK("state" IN ('requested', 'approved', 'declined', 'withdrawn', 'fulfilled', 'lapsed')),
	CONSTRAINT "budgets_spending_requests_declined" CHECK("state" <> 'declined' OR "decision_note" IS NOT NULL),
	CONSTRAINT "budgets_spending_requests_source" CHECK(("source_module" IS NULL) = ("source_id" IS NULL) AND ("source_type" IS NULL) = ("source_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `budgets_spending_requests_line` ON `budgets_spending_requests` (`line_id`,`state`);--> statement-breakpoint
CREATE INDEX `budgets_spending_requests_by` ON `budgets_spending_requests` (`requested_by`,`created_at`);--> statement-breakpoint
CREATE INDEX `budgets_spending_requests_state` ON `budgets_spending_requests` (`state`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_spending_requests_source` ON `budgets_spending_requests` (`source_module`,`source_type`,`source_id`) WHERE source_id IS NOT NULL;
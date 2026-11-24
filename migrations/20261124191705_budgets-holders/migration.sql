CREATE TABLE `budgets_holders` (
	`budget_id` text NOT NULL,
	`account_id` text NOT NULL,
	`added_by` text,
	`added_at` integer NOT NULL,
	CONSTRAINT `budgets_holders_pk` PRIMARY KEY(`budget_id`, `account_id`),
	CONSTRAINT `fk_budgets_holders_budget_id_budgets_budgets_id_fk` FOREIGN KEY (`budget_id`) REFERENCES `budgets_budgets`(`id`)
);
--> statement-breakpoint
CREATE INDEX `budgets_holders_account` ON `budgets_holders` (`account_id`);
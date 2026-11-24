ALTER TABLE `budgets_claims` ADD `chased_at` integer;--> statement-breakpoint
ALTER TABLE `budgets_lines` ADD `over_notified_at` integer;--> statement-breakpoint
ALTER TABLE `budgets_spending_requests` ADD `chased_at` integer;
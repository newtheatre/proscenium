ALTER TABLE `transactions` ADD `tab_debtor_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `tab_settled_at` integer;--> statement-breakpoint
ALTER TABLE `transactions` ADD `tab_settlement_transaction_id` text REFERENCES transactions(id);--> statement-breakpoint
CREATE INDEX `transactions_tab_debtor_idx` ON `transactions` (`tab_debtor_user_id`,`tab_settled_at`);
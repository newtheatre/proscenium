ALTER TABLE `ledger_entries` ADD `till_session_id` text;--> statement-breakpoint
CREATE INDEX `ledger_entries_happened_at` ON `ledger_entries` (`happened_at`);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `location_venue_id` text;
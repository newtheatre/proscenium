ALTER TABLE `ledger_entries` ADD `void_reason` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_entries_void_once` ON `ledger_entries` (`void_of_entry_id`) WHERE "ledger_entries"."void_of_entry_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE `ledger_lines` ADD `settles_entry_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_lines_settles_once` ON `ledger_lines` (`settles_entry_id`) WHERE "ledger_lines"."settles_entry_id" IS NOT NULL;
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`happened_at` integer DEFAULT (unixepoch()) NOT NULL,
	`london_day` text NOT NULL,
	`source` text NOT NULL,
	`tender` text NOT NULL,
	`actor_id` text,
	`total_pence` integer NOT NULL,
	`reverses_entry_id` text,
	`comp_reason` text,
	`comp_approved_by` text,
	`discount_id` text,
	`discount_percent` integer,
	`discount_pence` integer,
	`tab_debtor_id` text,
	`tab_settled_at` integer,
	`tab_settlement_entry_id` text,
	`void_of_entry_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`comp_approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tab_debtor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ledger_entries_source" CHECK("ledger_entries"."source" IN ('DESK', 'TILL', 'SELF_SERVE', 'IMPORT', 'SYSTEM')),
	CONSTRAINT "ledger_entries_tender" CHECK("ledger_entries"."tender" IN ('CARD', 'COMP', 'TAB', 'NONE')),
	CONSTRAINT "ledger_entries_no_self_reversal" CHECK("ledger_entries"."reverses_entry_id" IS NULL OR "ledger_entries"."reverses_entry_id" <> "ledger_entries"."id")
);
--> statement-breakpoint
CREATE INDEX `ledger_entries_london_day` ON `ledger_entries` (`london_day`);--> statement-breakpoint
CREATE INDEX `ledger_entries_reverses` ON `ledger_entries` (`reverses_entry_id`);--> statement-breakpoint
CREATE INDEX `ledger_entries_tab_debtor` ON `ledger_entries` (`tab_debtor_id`);--> statement-breakpoint
CREATE TABLE `ledger_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_pence` integer NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`unit_price_pence` integer,
	`reservation_id` text,
	`performance_id` text,
	`ticket_id` text,
	`product_variant_id` text,
	`price_ref` text,
	`choices` text,
	FOREIGN KEY (`entry_id`) REFERENCES `ledger_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ledger_lines_entry` ON `ledger_lines` (`entry_id`);--> statement-breakpoint
CREATE INDEX `ledger_lines_kind` ON `ledger_lines` (`kind`);--> statement-breakpoint
CREATE INDEX `ledger_lines_performance` ON `ledger_lines` (`performance_id`);
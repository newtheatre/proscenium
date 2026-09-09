CREATE TABLE `discounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`percent` integer NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "discounts_percent_range" CHECK("discounts"."percent" > 0 AND "discounts"."percent" <= 100),
	CONSTRAINT "discounts_status_values" CHECK("discounts"."status" IN ('ACTIVE', 'RETIRED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discounts_name_nocase` ON `discounts` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE UNIQUE INDEX `discounts_name` ON `discounts` (`name`);--> statement-breakpoint
ALTER TABLE `ledger_lines` ADD `discount_id` text;--> statement-breakpoint
ALTER TABLE `ledger_lines` ADD `discount_percent` integer;--> statement-breakpoint
ALTER TABLE `ledger_lines` ADD `discount_pence` integer;
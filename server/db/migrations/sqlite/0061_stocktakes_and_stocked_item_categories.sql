CREATE TABLE `stocktake_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`stocktake_id` text NOT NULL,
	`item_id` text NOT NULL,
	`expected_qty` integer NOT NULL,
	`counted_qty` integer,
	FOREIGN KEY (`stocktake_id`) REFERENCES `stocktakes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `bar_items`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "stocktake_lines_counted_not_negative" CHECK("stocktake_lines"."counted_qty" IS NULL OR "stocktake_lines"."counted_qty" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stocktake_lines_item` ON `stocktake_lines` (`stocktake_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `stocktakes` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`opened_by` text NOT NULL,
	`opened_at` integer DEFAULT (unixepoch()) NOT NULL,
	`applied_by` text,
	`applied_at` integer,
	FOREIGN KEY (`opened_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`applied_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "stocktakes_status_values" CHECK("stocktakes"."status" IN ('OPEN', 'APPLIED')),
	CONSTRAINT "stocktakes_apply_is_whole" CHECK(("stocktakes"."applied_at" IS NULL) = ("stocktakes"."applied_by" IS NULL)),
	CONSTRAINT "stocktakes_applies_after_it_opens" CHECK("stocktakes"."applied_at" IS NULL OR "stocktakes"."applied_at" >= "stocktakes"."opened_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stocktakes_one_open` ON `stocktakes` (`status`) WHERE status = 'OPEN';--> statement-breakpoint
ALTER TABLE `bar_items` ADD `category` text;
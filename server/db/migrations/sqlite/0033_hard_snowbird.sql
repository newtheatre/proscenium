CREATE TABLE `stock_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier` text NOT NULL,
	`delivered_on` text NOT NULL,
	`invoice_ref` text,
	`total_pence` integer,
	`notes` text,
	`received_by_user_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`received_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `stock_deliveries_date_idx` ON `stock_deliveries` (`delivered_on`);--> statement-breakpoint
CREATE TABLE `stock_delivery_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_id` text NOT NULL,
	`product_id` text NOT NULL,
	`qty_milli` integer NOT NULL,
	`cost_pence_per_unit` integer,
	FOREIGN KEY (`delivery_id`) REFERENCES `stock_deliveries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `stock_delivery_lines_delivery_idx` ON `stock_delivery_lines` (`delivery_id`);--> statement-breakpoint
CREATE INDEX `stock_delivery_lines_product_idx` ON `stock_delivery_lines` (`product_id`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`qty_milli` integer NOT NULL,
	`kind` text NOT NULL,
	`ref_table` text,
	`ref_id` text,
	`cost_pence_per_unit` integer,
	`reason` text,
	`created_by_user_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `stock_movements_product_idx` ON `stock_movements` (`product_id`);--> statement-breakpoint
CREATE INDEX `stock_movements_ref_idx` ON `stock_movements` (`ref_table`,`ref_id`);--> statement-breakpoint
CREATE INDEX `stock_movements_created_idx` ON `stock_movements` (`created_at`);--> statement-breakpoint
CREATE TABLE `stocktake_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`stocktake_id` text NOT NULL,
	`product_id` text NOT NULL,
	`expected_milli` integer NOT NULL,
	`counted_milli` integer,
	`reason` text,
	FOREIGN KEY (`stocktake_id`) REFERENCES `stocktakes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `stocktake_lines_stocktake_idx` ON `stocktake_lines` (`stocktake_id`);--> statement-breakpoint
CREATE TABLE `stocktakes` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`notes` text,
	`started_by_user_id` text,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`finished_by_user_id` text,
	`finished_at` text,
	FOREIGN KEY (`started_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`finished_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `stocktakes_status_idx` ON `stocktakes` (`status`);
CREATE TABLE `transaction_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_pence` integer NOT NULL,
	`reservation_id` text,
	`performance_id` text,
	`product_id` text,
	`qty` integer,
	`unit_price_pence` integer,
	`price_id` text,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `transaction_lines_transaction_idx` ON `transaction_lines` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `transaction_lines_kind_performance_idx` ON `transaction_lines` (`kind`,`performance_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`taken_at` integer NOT NULL,
	`taken_on` text NOT NULL,
	`taken_by_user_id` text NOT NULL,
	`source` text NOT NULL,
	`tender` text NOT NULL,
	`bar_session_id` text,
	`comp_reason` text,
	`comp_approved_by_user_id` text,
	`comp_approved_at` integer,
	`discount_id` text,
	`discount_percent` integer,
	`discount_pence` integer DEFAULT 0 NOT NULL,
	`total_pence` integer NOT NULL,
	`voided_at` integer,
	`voided_by_user_id` text,
	`void_reason` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`taken_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`comp_approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`discount_id`) REFERENCES `bar_discounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`voided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `transactions_taken_on_idx` ON `transactions` (`taken_on`);--> statement-breakpoint
CREATE INDEX `transactions_bar_session_idx` ON `transactions` (`bar_session_id`);
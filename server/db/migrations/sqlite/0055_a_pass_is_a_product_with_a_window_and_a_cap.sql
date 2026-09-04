CREATE TABLE `pass_type_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`pass_type_id` text NOT NULL,
	`label` text NOT NULL,
	`price` integer NOT NULL,
	FOREIGN KEY (`pass_type_id`) REFERENCES `pass_types`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "pass_type_prices_price_pence" CHECK("pass_type_prices"."price" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pass_type_prices_pair` ON `pass_type_prices` (`pass_type_id`,`label`);--> statement-breakpoint
CREATE TABLE `pass_type_shows` (
	`id` text PRIMARY KEY NOT NULL,
	`pass_type_id` text NOT NULL,
	`show_id` text NOT NULL,
	FOREIGN KEY (`pass_type_id`) REFERENCES `pass_types`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pass_type_shows_pair` ON `pass_type_shows` (`pass_type_id`,`show_id`);--> statement-breakpoint
CREATE TABLE `pass_types` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`valid_from` integer NOT NULL,
	`valid_until` integer NOT NULL,
	`sales_open_at` integer,
	`sales_close_at` integer,
	`max_issued` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "pass_types_status_values" CHECK("pass_types"."status" IN ('DRAFT', 'ON_SALE', 'CLOSED')),
	CONSTRAINT "pass_types_valid_window" CHECK("pass_types"."valid_until" >= "pass_types"."valid_from"),
	CONSTRAINT "pass_types_max_issued_positive" CHECK("pass_types"."max_issued" IS NULL OR "pass_types"."max_issued" > 0),
	CONSTRAINT "pass_types_sales_window" CHECK("pass_types"."sales_close_at" IS NULL OR "pass_types"."sales_open_at" IS NULL OR "pass_types"."sales_close_at" >= "pass_types"."sales_open_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pass_types_slug` ON `pass_types` (`slug`);
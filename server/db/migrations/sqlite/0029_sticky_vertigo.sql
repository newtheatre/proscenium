CREATE TABLE `bar_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`colour` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bar_categories_name_unique` ON `bar_categories` (`name`);--> statement-breakpoint
CREATE TABLE `bar_discounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`percent` integer NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bar_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`price_pence` integer NOT NULL,
	`effective_from` text NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bar_prices_product_from_unique` ON `bar_prices` (`product_id`,`effective_from`);--> statement-breakpoint
CREATE INDEX `bar_prices_product_idx` ON `bar_prices` (`product_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `bar_products` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`unit` text DEFAULT 'each' NOT NULL,
	`stock_product_id` text,
	`depletes_milli` integer DEFAULT 1000 NOT NULL,
	`par_milli` integer,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`age_restricted` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `bar_categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `bar_products_category_idx` ON `bar_products` (`category_id`,`sort`);
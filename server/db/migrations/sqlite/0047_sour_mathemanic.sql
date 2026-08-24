PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bar_products` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`unit` text DEFAULT 'each' NOT NULL,
	`container_ml` integer,
	`stock_only` integer DEFAULT false NOT NULL,
	`stock_product_id` text,
	`depletes_qty` integer,
	`par_qty` integer,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`age_restricted` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `bar_categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_bar_products`("id", "category_id", "name", "unit", "container_ml", "stock_only", "stock_product_id", "depletes_qty", "par_qty", "status", "sort", "age_restricted", "created_at", "updated_at") SELECT "id", "category_id", "name", "unit", "container_ml", "stock_only", "stock_product_id", "depletes_qty", "par_qty", "status", "sort", "age_restricted", "created_at", "updated_at" FROM `bar_products`;--> statement-breakpoint
DROP TABLE `bar_products`;--> statement-breakpoint
ALTER TABLE `__new_bar_products` RENAME TO `bar_products`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `bar_products_category_idx` ON `bar_products` (`category_id`,`sort`);
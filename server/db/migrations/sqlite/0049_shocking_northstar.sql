CREATE TABLE `bar_recipe_items` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`component_product_id` text,
	`choice_category_id` text,
	`qty` integer NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_product_id`) REFERENCES `bar_products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`choice_category_id`) REFERENCES `bar_categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `bar_recipe_items_product_idx` ON `bar_recipe_items` (`product_id`,`sort`);--> statement-breakpoint
CREATE INDEX `bar_recipe_items_component_idx` ON `bar_recipe_items` (`component_product_id`);--> statement-breakpoint
ALTER TABLE `transaction_lines` ADD `choices` text;
CREATE TABLE `bar_product_presets` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`sizes` text NOT NULL,
	`group_ids` text NOT NULL,
	`age_restricted` integer,
	`mixer` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `bar_categories` ADD `age_restricted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bar_categories` ADD `usual_preset` text;--> statement-breakpoint
ALTER TABLE `bar_products` ADD `age_from_category` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_product_presets_name` ON `bar_product_presets` (lower("name")) WHERE active = 1;
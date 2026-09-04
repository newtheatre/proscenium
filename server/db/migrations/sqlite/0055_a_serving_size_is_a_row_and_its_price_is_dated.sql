CREATE TABLE `choice_group_items` (
	`id` text PRIMARY KEY NOT NULL,
	`choice_group_id` text NOT NULL,
	`item_id` text NOT NULL,
	`qty` integer NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`choice_group_id`) REFERENCES `choice_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `bar_items`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "choice_group_items_qty_positive" CHECK("choice_group_items"."qty" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `choice_group_items_option` ON `choice_group_items` (`choice_group_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `choice_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `choice_groups_name_nocase` ON `choice_groups` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`serving_kind` text NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "product_variants_status_values" CHECK("product_variants"."status" IN ('ACTIVE', 'RETIRED'))
);
--> statement-breakpoint
CREATE INDEX `product_variants_product` ON `product_variants` (`product_id`,`sort`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_variants_kind` ON `product_variants` (`product_id`,`serving_kind`);--> statement-breakpoint
CREATE TABLE `variant_components` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`item_id` text,
	`choice_group_id` text,
	`qty` integer NOT NULL,
	`included_in_price` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `bar_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`choice_group_id`) REFERENCES `choice_groups`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "variant_components_one_source" CHECK(("variant_components"."item_id" IS NULL) <> ("variant_components"."choice_group_id" IS NULL)),
	CONSTRAINT "variant_components_qty_positive" CHECK("variant_components"."qty" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `variant_components_item` ON `variant_components` (`variant_id`,`item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `variant_components_choice` ON `variant_components` (`variant_id`,`choice_group_id`);--> statement-breakpoint
CREATE TABLE `variant_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`price_pence` integer NOT NULL,
	`effective_from` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "variant_prices_pence" CHECK("variant_prices"."price_pence" >= 0),
	CONSTRAINT "variant_prices_effective_from_is_a_date" CHECK("variant_prices"."effective_from" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `variant_prices_resolution` ON `variant_prices` (`variant_id`,`effective_from`,`created_at`);
--> statement-breakpoint
-- Append-only is trigger-enforced, not a convention (decision 0010). A sale snapshots the price it
-- resolved, so an edit here would restate history that a correcting row is meant to supersede.

CREATE TRIGGER variant_prices_no_update
BEFORE UPDATE ON variant_prices
BEGIN
  SELECT RAISE(ABORT, 'variant_prices is append-only: correct a price with a new row dated today, which wins from the moment it is written');
END;
--> statement-breakpoint
CREATE TRIGGER variant_prices_no_delete
BEFORE DELETE ON variant_prices
BEGIN
  SELECT RAISE(ABORT, 'variant_prices is append-only: correct a price with a new row dated today, which wins from the moment it is written');
END;
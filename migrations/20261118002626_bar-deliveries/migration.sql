CREATE TABLE `bar_deliveries` (
	`id` text PRIMARY KEY,
	`location_id` text NOT NULL,
	`supplier_term` text,
	`supplier_ref` text,
	`state` text NOT NULL,
	`created_by` text NOT NULL,
	`received_by` text,
	`received_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_deliveries_location_id_bar_stock_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `bar_stock_locations`(`id`),
	CONSTRAINT `fk_bar_deliveries_supplier_term_core_terms_id_fk` FOREIGN KEY (`supplier_term`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "bar_deliveries_state" CHECK("state" IN ('draft', 'received')),
	CONSTRAINT "bar_deliveries_ref" CHECK("supplier_ref" IS NULL OR length("supplier_ref") <= 40),
	CONSTRAINT "bar_deliveries_received" CHECK(("state" = 'received') = ("received_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `bar_delivery_lines` (
	`id` text PRIMARY KEY,
	`delivery_id` text NOT NULL,
	`stock_item_id` text NOT NULL,
	`packs` integer DEFAULT 0 NOT NULL,
	`loose_units` integer DEFAULT 0 NOT NULL,
	`pack_cost_minor` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_delivery_lines_delivery_id_bar_deliveries_id_fk` FOREIGN KEY (`delivery_id`) REFERENCES `bar_deliveries`(`id`),
	CONSTRAINT `fk_bar_delivery_lines_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT "bar_delivery_lines_quantity" CHECK("packs" >= 0 AND "loose_units" >= 0 AND "packs" + "loose_units" > 0),
	CONSTRAINT "bar_delivery_lines_cost" CHECK("pack_cost_minor" IS NULL OR "pack_cost_minor" >= 0)
);
--> statement-breakpoint
CREATE INDEX `bar_deliveries_state` ON `bar_deliveries` (`state`,`received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_delivery_lines_item` ON `bar_delivery_lines` (`delivery_id`,`stock_item_id`);
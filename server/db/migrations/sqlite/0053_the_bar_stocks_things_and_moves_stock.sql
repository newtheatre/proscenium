CREATE TABLE `bar_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`colour` text,
	CONSTRAINT "bar_categories_colour_hex" CHECK("bar_categories"."colour" IS NULL OR "bar_categories"."colour" GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bar_categories_name_nocase` ON `bar_categories` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_categories_name` ON `bar_categories` (`name`);--> statement-breakpoint
CREATE TABLE `bar_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`unit` text NOT NULL,
	`container_ml` integer,
	`par_qty` integer,
	`age_restricted` integer DEFAULT true NOT NULL,
	`allergen_notes` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "bar_items_unit_values" CHECK("bar_items"."unit" IN ('ML', 'ITEM')),
	CONSTRAINT "bar_items_status_values" CHECK("bar_items"."status" IN ('ACTIVE', 'RETIRED')),
	CONSTRAINT "bar_items_container_is_measured" CHECK("bar_items"."container_ml" IS NULL OR ("bar_items"."unit" = 'ML' AND "bar_items"."container_ml" > 0)),
	CONSTRAINT "bar_items_par_not_negative" CHECK("bar_items"."par_qty" IS NULL OR "bar_items"."par_qty" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bar_items_name_nocase` ON `bar_items` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_items_name` ON `bar_items` (`name`);--> statement-breakpoint
CREATE TABLE `bar_products` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'HIDDEN' NOT NULL,
	`staffed_only` integer DEFAULT false NOT NULL,
	`age_restricted` integer DEFAULT false NOT NULL,
	`allergen_state` text DEFAULT 'UNKNOWN' NOT NULL,
	`allergen_note` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `bar_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "bar_products_status_values" CHECK("bar_products"."status" IN ('ACTIVE', 'HIDDEN', 'RETIRED')),
	CONSTRAINT "bar_products_allergen_state_values" CHECK("bar_products"."allergen_state" IN ('UNKNOWN', 'NONE', 'RECORDED')),
	CONSTRAINT "bar_products_recorded_allergens_have_a_note" CHECK("bar_products"."allergen_state" <> 'RECORDED' OR "bar_products"."allergen_note" IS NOT NULL),
	CONSTRAINT "bar_products_unknown_allergens_have_no_note" CHECK("bar_products"."allergen_state" <> 'UNKNOWN' OR "bar_products"."allergen_note" IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bar_products_name_nocase` ON `bar_products` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE INDEX `bar_products_category` ON `bar_products` (`category_id`,`sort`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_products_name` ON `bar_products` (`name`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`qty` integer NOT NULL,
	`kind` text NOT NULL,
	`reason` text,
	`unit_cost_pence` integer,
	`ref_table` text,
	`ref_id` text,
	`reverses_id` text,
	`actor_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `bar_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reverses_id`) REFERENCES `stock_movements`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "stock_movements_kind_values" CHECK("stock_movements"."kind" IN ('DELIVERY', 'SALE', 'COMP', 'STOCKTAKE', 'WASTAGE', 'TRANSFER', 'ADJUST', 'REVERSAL')),
	CONSTRAINT "stock_movements_qty_moves_something" CHECK("stock_movements"."qty" <> 0),
	CONSTRAINT "stock_movements_delivery_adds" CHECK("stock_movements"."kind" <> 'DELIVERY' OR "stock_movements"."qty" > 0),
	CONSTRAINT "stock_movements_wastage_takes_away_with_a_reason" CHECK("stock_movements"."kind" <> 'WASTAGE' OR ("stock_movements"."qty" < 0 AND "stock_movements"."reason" IS NOT NULL)),
	CONSTRAINT "stock_movements_cost_is_a_delivery_fact" CHECK("stock_movements"."unit_cost_pence" IS NULL OR ("stock_movements"."kind" = 'DELIVERY' AND "stock_movements"."unit_cost_pence" >= 0)),
	CONSTRAINT "stock_movements_reversal_names_what_it_reverses" CHECK(("stock_movements"."reverses_id" IS NOT NULL) = ("stock_movements"."kind" = 'REVERSAL')),
	CONSTRAINT "stock_movements_source_document_is_whole" CHECK(("stock_movements"."ref_table" IS NULL) = ("stock_movements"."ref_id" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `stock_movements_item` ON `stock_movements` (`item_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_movements_kind` ON `stock_movements` (`kind`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `stock_movements_one_reversal` ON `stock_movements` (`reverses_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `stock_movements_stocktake_line` ON `stock_movements` (`ref_id`) WHERE ref_table = 'stocktake_lines';
--> statement-breakpoint
-- Append-only is trigger-enforced, not a convention (decision 0010). On-hand is the sum of these
-- rows, so an edit or a deletion silently restates every figure taken from them since.

CREATE TRIGGER stock_movements_no_update
BEFORE UPDATE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock_movements is append-only: correct it with a reversing movement naming the one it corrects');
END;
--> statement-breakpoint
CREATE TRIGGER stock_movements_no_delete
BEFORE DELETE ON stock_movements
BEGIN
  SELECT RAISE(ABORT, 'stock_movements is append-only: correct it with a reversing movement naming the one it corrects');
END;
--> statement-breakpoint
-- A reversal that does not cancel what it names leaves on-hand wrong in a way no report can see.
-- Two rows correlate, so this is a trigger rather than a CHECK.

CREATE TRIGGER stock_movements_reversal_cancels_what_it_names
BEFORE INSERT ON stock_movements
WHEN NEW.reverses_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_movements
    WHERE id = NEW.reverses_id AND item_id = NEW.item_id AND qty = -NEW.qty
  )
BEGIN
  SELECT RAISE(ABORT, 'a reversal cancels the movement it names: same stocked item, opposite quantity');
END;
--> statement-breakpoint
-- The old estate lost its container sizes to a migration that rewrote them under live stock
-- (audit PR-12, 0017). Correcting one is retire and re-add, so the history keeps its meaning.

CREATE TRIGGER bar_items_measure_is_fixed_once_stock_has_moved
BEFORE UPDATE ON bar_items
WHEN (OLD.unit IS NOT NEW.unit OR OLD.container_ml IS NOT NEW.container_ml)
  AND EXISTS (SELECT 1 FROM stock_movements WHERE item_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'this item has stock movements, so its unit and container size are fixed: retire it and add it again');
END;
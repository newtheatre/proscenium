CREATE TABLE `awards_awards` (
	`id` text PRIMARY KEY,
	`type_id` text NOT NULL,
	`account_id` text,
	`recipient_name` text NOT NULL,
	`awarded_on` text NOT NULL,
	`awarded_precision` text DEFAULT 'day' NOT NULL,
	`awarded_for` text,
	`citation` text,
	`production_id` text,
	`decided_on` text,
	`decision_note` text,
	`source` text NOT NULL,
	`response_id` text,
	`visibility` text NOT NULL,
	`listing_pending` integer DEFAULT false NOT NULL,
	`state` text DEFAULT 'current' NOT NULL,
	`issued_by` text,
	`revoked_at` integer,
	`revoked_by` text,
	`revoke_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_awards_awards_type_id_awards_types_id_fk` FOREIGN KEY (`type_id`) REFERENCES `awards_types`(`id`),
	CONSTRAINT `fk_awards_awards_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`),
	CONSTRAINT "awards_awards_state" CHECK("state" IN ('current', 'revoked')),
	CONSTRAINT "awards_awards_source" CHECK("source" IN ('direct', 'nomination', 'import')),
	CONSTRAINT "awards_awards_visibility" CHECK("visibility" IN ('public', 'members', 'hidden')),
	CONSTRAINT "awards_awards_name" CHECK(length("recipient_name") BETWEEN 1 AND 120),
	CONSTRAINT "awards_awards_revoked" CHECK(("state" = 'revoked') = ("revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `awards_types` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`summary` text,
	`gives_ticket_benefit` integer DEFAULT false NOT NULL,
	`one_per_person` integer DEFAULT true NOT NULL,
	`default_visibility` text DEFAULT 'public' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "awards_types_state_values" CHECK("state" IN ('active', 'archived')),
	CONSTRAINT "awards_types_visibility" CHECK("default_visibility" IN ('public', 'members', 'hidden')),
	CONSTRAINT "awards_types_name" CHECK(length("name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE `bar_age_checks` (
	`id` text PRIMARY KEY,
	`opening_id` text NOT NULL,
	`sale_id` text,
	`outcome` text NOT NULL,
	`refusal_term` text,
	`variant_id` text,
	`basket_key` text,
	`id_type` text,
	`refusal_scope` text,
	`description` text,
	`by` text NOT NULL,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_age_checks_opening_id_bar_openings_id_fk` FOREIGN KEY (`opening_id`) REFERENCES `bar_openings`(`id`),
	CONSTRAINT `fk_bar_age_checks_sale_id_bar_sales_id_fk` FOREIGN KEY (`sale_id`) REFERENCES `bar_sales`(`id`),
	CONSTRAINT `fk_bar_age_checks_refusal_term_core_terms_id_fk` FOREIGN KEY (`refusal_term`) REFERENCES `core_terms`(`id`),
	CONSTRAINT `fk_bar_age_checks_variant_id_bar_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `bar_variants`(`id`),
	CONSTRAINT "bar_age_checks_outcome" CHECK("outcome" IN ('not_needed', 'id_checked', 'self_attested', 'refused')),
	CONSTRAINT "bar_age_checks_reason" CHECK(("outcome" = 'refused') = ("refusal_term" IS NOT NULL)),
	CONSTRAINT "bar_age_checks_description" CHECK("description" IS NULL OR ("outcome" = 'refused' AND length("description") <= 120))
);
--> statement-breakpoint
CREATE TABLE `bar_allergen_checks` (
	`id` text PRIMARY KEY,
	`product_id` text,
	`option_id` text,
	`source` text NOT NULL,
	`contains` text NOT NULL,
	`may_contain` text NOT NULL,
	`by` text NOT NULL,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_allergen_checks_product_id_bar_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`),
	CONSTRAINT `fk_bar_allergen_checks_option_id_bar_choice_options_id_fk` FOREIGN KEY (`option_id`) REFERENCES `bar_choice_options`(`id`),
	CONSTRAINT "bar_allergen_checks_one" CHECK(("product_id" IS NULL) <> ("option_id" IS NULL)),
	CONSTRAINT "bar_allergen_checks_source" CHECK("source" IN ('label', 'supplier', 'other'))
);
--> statement-breakpoint
CREATE TABLE `bar_allergen_entries` (
	`id` text PRIMARY KEY,
	`product_id` text,
	`option_id` text,
	`stock_item_id` text,
	`allergen` text NOT NULL,
	`level` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_allergen_entries_product_id_bar_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`),
	CONSTRAINT `fk_bar_allergen_entries_option_id_bar_choice_options_id_fk` FOREIGN KEY (`option_id`) REFERENCES `bar_choice_options`(`id`),
	CONSTRAINT `fk_bar_allergen_entries_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT "bar_allergen_entries_one" CHECK(("product_id" IS NOT NULL) + ("option_id" IS NOT NULL) + ("stock_item_id" IS NOT NULL) = 1),
	CONSTRAINT "bar_allergen_entries_allergen" CHECK("allergen" IN ('gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soya', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs')),
	CONSTRAINT "bar_allergen_entries_level" CHECK("level" IN ('contains', 'may_contain'))
);
--> statement-breakpoint
CREATE TABLE `bar_categories` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`colour` text,
	`parent_id` text,
	`age_restricted` integer DEFAULT false NOT NULL,
	`usual_preset` text,
	`income_account_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_categories_parent_id_bar_categories_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `bar_categories`(`id`)
);
--> statement-breakpoint
CREATE TABLE `bar_choice_groups` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`max_picks` integer DEFAULT 1 NOT NULL,
	`default_key` text,
	`mixer_pricing` text,
	`mixer_fixed_minor` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "bar_choice_groups_source" CHECK("source" IN ('options', 'mixers')),
	CONSTRAINT "bar_choice_groups_picks" CHECK("max_picks" >= 1),
	CONSTRAINT "bar_choice_groups_mixers" CHECK(("source" = 'mixers') = ("mixer_pricing" IS NOT NULL)),
	CONSTRAINT "bar_choice_groups_fixed" CHECK(("mixer_pricing" IS 'fixed') = ("mixer_fixed_minor" IS NOT NULL) AND ("mixer_fixed_minor" IS NULL OR "mixer_fixed_minor" >= 0))
);
--> statement-breakpoint
CREATE TABLE `bar_choice_options` (
	`id` text PRIMARY KEY,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`delta_minor` integer DEFAULT 0 NOT NULL,
	`age_restricted` integer DEFAULT false NOT NULL,
	`stock_item_id` text,
	`position` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_choice_options_group_id_bar_choice_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `bar_choice_groups`(`id`),
	CONSTRAINT `fk_bar_choice_options_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT "bar_choice_options_delta" CHECK("delta_minor" >= 0)
);
--> statement-breakpoint
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
CREATE TABLE `bar_openings` (
	`id` text PRIMARY KEY,
	`outlet_id` text NOT NULL,
	`performance_id` text,
	`operating_day` text NOT NULL,
	`state` text NOT NULL,
	`opened_by` text NOT NULL,
	`closed_by` text,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_openings_outlet_id_bar_outlets_id_fk` FOREIGN KEY (`outlet_id`) REFERENCES `bar_outlets`(`id`),
	CONSTRAINT `fk_bar_openings_performance_id_core_performances_id_fk` FOREIGN KEY (`performance_id`) REFERENCES `core_performances`(`id`),
	CONSTRAINT "bar_openings_state" CHECK("state" IN ('open', 'closed'))
);
--> statement-breakpoint
CREATE TABLE `bar_outlet_favourites` (
	`id` text PRIMARY KEY,
	`outlet_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_outlet_favourites_outlet_id_bar_outlets_id_fk` FOREIGN KEY (`outlet_id`) REFERENCES `bar_outlets`(`id`),
	CONSTRAINT `fk_bar_outlet_favourites_variant_id_bar_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `bar_variants`(`id`)
);
--> statement-breakpoint
CREATE TABLE `bar_outlets` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`price_list_id` text NOT NULL,
	`space_id` text,
	`stock_location_id` text,
	`till_layout` text DEFAULT 'chips' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_outlets_price_list_id_bar_price_lists_id_fk` FOREIGN KEY (`price_list_id`) REFERENCES `bar_price_lists`(`id`),
	CONSTRAINT `fk_bar_outlets_space_id_core_spaces_id_fk` FOREIGN KEY (`space_id`) REFERENCES `core_spaces`(`id`),
	CONSTRAINT `fk_bar_outlets_stock_location_id_bar_stock_locations_id_fk` FOREIGN KEY (`stock_location_id`) REFERENCES `bar_stock_locations`(`id`),
	CONSTRAINT "bar_outlets_kind" CHECK("kind" IN ('bar', 'kiosk', 'desk'))
);
--> statement-breakpoint
CREATE TABLE `bar_price_lists` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`system_key` text,
	`restricted` integer DEFAULT false NOT NULL,
	`falls_back` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "bar_price_lists_standard" CHECK("system_key" IS NULL OR "active" = 1)
);
--> statement-breakpoint
CREATE TABLE `bar_prices` (
	`id` text PRIMARY KEY,
	`variant_id` text NOT NULL,
	`price_list_id` text NOT NULL,
	`amount_minor` integer,
	`currency` text NOT NULL,
	`effective_from` integer NOT NULL,
	`set_by` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_prices_variant_id_bar_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `bar_variants`(`id`),
	CONSTRAINT `fk_bar_prices_price_list_id_bar_price_lists_id_fk` FOREIGN KEY (`price_list_id`) REFERENCES `bar_price_lists`(`id`),
	CONSTRAINT "bar_prices_amount" CHECK("amount_minor" IS NULL OR "amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `bar_product_choice_groups` (
	`id` text PRIMARY KEY,
	`product_id` text NOT NULL,
	`group_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_product_choice_groups_product_id_bar_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`),
	CONSTRAINT `fk_bar_product_choice_groups_group_id_bar_choice_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `bar_choice_groups`(`id`)
);
--> statement-breakpoint
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
CREATE TABLE `bar_products` (
	`id` text PRIMARY KEY,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`age_restricted` integer DEFAULT false NOT NULL,
	`age_from_category` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_products_category_id_bar_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `bar_categories`(`id`)
);
--> statement-breakpoint
CREATE TABLE `bar_recipe_lines` (
	`id` text PRIMARY KEY,
	`variant_id` text NOT NULL,
	`stock_item_id` text,
	`choice_group_id` text,
	`quantity` integer NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_recipe_lines_variant_id_bar_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `bar_variants`(`id`),
	CONSTRAINT `fk_bar_recipe_lines_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT `fk_bar_recipe_lines_choice_group_id_bar_choice_groups_id_fk` FOREIGN KEY (`choice_group_id`) REFERENCES `bar_choice_groups`(`id`),
	CONSTRAINT "bar_recipe_lines_one" CHECK(("stock_item_id" IS NULL) <> ("choice_group_id" IS NULL)),
	CONSTRAINT "bar_recipe_lines_quantity" CHECK("quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE `bar_register_reviews` (
	`id` text PRIMARY KEY,
	`outlet_id` text,
	`from_day` text NOT NULL,
	`to_day` text NOT NULL,
	`refusals` integer NOT NULL,
	`reviewed_by` text NOT NULL,
	`reviewed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_register_reviews_outlet_id_bar_outlets_id_fk` FOREIGN KEY (`outlet_id`) REFERENCES `bar_outlets`(`id`),
	CONSTRAINT "bar_register_reviews_days" CHECK("to_day" >= "from_day"),
	CONSTRAINT "bar_register_reviews_refusals" CHECK("refusals" >= 0)
);
--> statement-breakpoint
CREATE TABLE `bar_sale_line_choices` (
	`id` text PRIMARY KEY,
	`sale_line_id` text NOT NULL,
	`group_id` text NOT NULL,
	`option_id` text,
	`mixer_variant_id` text,
	`label` text NOT NULL,
	`delta_minor` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_sale_line_choices_sale_line_id_bar_sale_lines_id_fk` FOREIGN KEY (`sale_line_id`) REFERENCES `bar_sale_lines`(`id`),
	CONSTRAINT `fk_bar_sale_line_choices_group_id_bar_choice_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `bar_choice_groups`(`id`),
	CONSTRAINT `fk_bar_sale_line_choices_option_id_bar_choice_options_id_fk` FOREIGN KEY (`option_id`) REFERENCES `bar_choice_options`(`id`),
	CONSTRAINT `fk_bar_sale_line_choices_mixer_variant_id_bar_variants_id_fk` FOREIGN KEY (`mixer_variant_id`) REFERENCES `bar_variants`(`id`),
	CONSTRAINT "bar_sale_line_choices_one" CHECK(("option_id" IS NULL) <> ("mixer_variant_id" IS NULL)),
	CONSTRAINT "bar_sale_line_choices_delta" CHECK("delta_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `bar_sale_lines` (
	`id` text PRIMARY KEY,
	`sale_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`price_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_minor` integer NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`amount_minor` integer NOT NULL,
	`promotion_redemption_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_sale_lines_sale_id_bar_sales_id_fk` FOREIGN KEY (`sale_id`) REFERENCES `bar_sales`(`id`),
	CONSTRAINT `fk_bar_sale_lines_variant_id_bar_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `bar_variants`(`id`),
	CONSTRAINT `fk_bar_sale_lines_price_id_bar_prices_id_fk` FOREIGN KEY (`price_id`) REFERENCES `bar_prices`(`id`),
	CONSTRAINT "bar_sale_lines_quantity" CHECK("quantity" >= 1),
	CONSTRAINT "bar_sale_lines_unit" CHECK("unit_minor" >= 0),
	CONSTRAINT "bar_sale_lines_discount" CHECK("discount_minor" >= 0 AND "discount_minor" <= "unit_minor" * "quantity"),
	CONSTRAINT "bar_sale_lines_amount" CHECK("amount_minor" = "unit_minor" * "quantity" - "discount_minor")
);
--> statement-breakpoint
CREATE TABLE `bar_sale_reversals` (
	`id` text PRIMARY KEY,
	`sale_line_id` text NOT NULL,
	`refund_id` text NOT NULL,
	`state` text NOT NULL,
	`quantity` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`reason_term` text NOT NULL,
	`stock_outcome` text NOT NULL,
	`requested_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_sale_reversals_sale_line_id_bar_sale_lines_id_fk` FOREIGN KEY (`sale_line_id`) REFERENCES `bar_sale_lines`(`id`),
	CONSTRAINT `fk_bar_sale_reversals_reason_term_core_terms_id_fk` FOREIGN KEY (`reason_term`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "bar_sale_reversals_state" CHECK("state" IN ('requested', 'succeeded', 'failed')),
	CONSTRAINT "bar_sale_reversals_stock" CHECK("stock_outcome" IN ('returned', 'wasted', 'none')),
	CONSTRAINT "bar_sale_reversals_quantity" CHECK("quantity" >= 0),
	CONSTRAINT "bar_sale_reversals_amount" CHECK("amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE `bar_sales` (
	`id` text PRIMARY KEY,
	`reference` text NOT NULL,
	`opening_id` text NOT NULL,
	`price_list_id` text NOT NULL,
	`state` text NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`intent_id` text,
	`part_id` text,
	`channel` text NOT NULL,
	`sold_by` text NOT NULL,
	`client_key` text NOT NULL,
	`paid_at` integer,
	`voided_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_sales_opening_id_bar_openings_id_fk` FOREIGN KEY (`opening_id`) REFERENCES `bar_openings`(`id`),
	CONSTRAINT `fk_bar_sales_price_list_id_bar_price_lists_id_fk` FOREIGN KEY (`price_list_id`) REFERENCES `bar_price_lists`(`id`),
	CONSTRAINT "bar_sales_state" CHECK("state" IN ('open', 'awaiting_payment', 'paid', 'void')),
	CONSTRAINT "bar_sales_channel" CHECK("channel" IN ('till', 'desk', 'self')),
	CONSTRAINT "bar_sales_total" CHECK("total_minor" >= 0),
	CONSTRAINT "bar_sales_paid" CHECK("state" <> 'paid' OR "paid_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `bar_stock_item_allergen_checks` (
	`id` text PRIMARY KEY,
	`stock_item_id` text NOT NULL,
	`source` text NOT NULL,
	`contains` text NOT NULL,
	`may_contain` text NOT NULL,
	`by` text NOT NULL,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_stock_item_allergen_checks_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT "bar_stock_item_allergen_checks_source" CHECK("source" IN ('label', 'supplier', 'other'))
);
--> statement-breakpoint
CREATE TABLE `bar_stock_items` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`category_id` text,
	`base_unit` text NOT NULL,
	`pack_size` integer NOT NULL,
	`pack_name` text NOT NULL,
	`count_unit_size` integer NOT NULL,
	`cost_minor` integer,
	`currency` text NOT NULL,
	`reorder_level` integer,
	`full_weight_g` integer,
	`empty_weight_g` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_stock_items_category_id_bar_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `bar_categories`(`id`),
	CONSTRAINT "bar_stock_items_unit" CHECK("base_unit" IN ('each', 'ml', 'g')),
	CONSTRAINT "bar_stock_items_sizes" CHECK("pack_size" >= 1 AND "count_unit_size" >= 1),
	CONSTRAINT "bar_stock_items_cost" CHECK("cost_minor" IS NULL OR "cost_minor" >= 0),
	CONSTRAINT "bar_stock_items_reorder" CHECK("reorder_level" IS NULL OR "reorder_level" >= 0),
	CONSTRAINT "bar_stock_items_weights" CHECK(("full_weight_g" IS NULL) = ("empty_weight_g" IS NULL) AND ("full_weight_g" IS NULL OR "full_weight_g" > "empty_weight_g" AND "empty_weight_g" >= 0))
);
--> statement-breakpoint
CREATE TABLE `bar_stock_levels` (
	`stock_item_id` text NOT NULL,
	`location_id` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`last_counted_at` integer,
	CONSTRAINT `bar_stock_levels_pk` PRIMARY KEY(`stock_item_id`, `location_id`),
	CONSTRAINT `fk_bar_stock_levels_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT `fk_bar_stock_levels_location_id_bar_stock_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `bar_stock_locations`(`id`)
);
--> statement-breakpoint
CREATE TABLE `bar_stock_locations` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`space_id` text,
	`venue_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_stock_locations_space_id_core_spaces_id_fk` FOREIGN KEY (`space_id`) REFERENCES `core_spaces`(`id`),
	CONSTRAINT `fk_bar_stock_locations_venue_id_core_venues_id_fk` FOREIGN KEY (`venue_id`) REFERENCES `core_venues`(`id`)
);
--> statement-breakpoint
CREATE TABLE `bar_stock_movements` (
	`id` text PRIMARY KEY,
	`stock_item_id` text NOT NULL,
	`location_id` text NOT NULL,
	`kind` text NOT NULL,
	`quantity` integer NOT NULL,
	`reason_term` text,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`by` text,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_bar_stock_movements_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT `fk_bar_stock_movements_location_id_bar_stock_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `bar_stock_locations`(`id`),
	CONSTRAINT `fk_bar_stock_movements_reason_term_core_terms_id_fk` FOREIGN KEY (`reason_term`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "bar_stock_movements_kind" CHECK("kind" IN ('opening', 'delivery', 'sale', 'sale_reversal', 'wastage', 'adjustment', 'transfer_out', 'transfer_in')),
	CONSTRAINT "bar_stock_movements_sign" CHECK("quantity" <> 0 AND ("kind" IN ('opening', 'adjustment') OR ("kind" IN ('delivery', 'transfer_in', 'sale_reversal')) = ("quantity" > 0))),
	CONSTRAINT "bar_stock_movements_wastage" CHECK("kind" <> 'wastage' OR "reason_term" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `bar_stocktake_lines` (
	`id` text PRIMARY KEY,
	`stocktake_id` text NOT NULL,
	`stock_item_id` text NOT NULL,
	`counted` integer,
	`expected` integer,
	`variance_reason_term` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_stocktake_lines_stocktake_id_bar_stocktakes_id_fk` FOREIGN KEY (`stocktake_id`) REFERENCES `bar_stocktakes`(`id`),
	CONSTRAINT `fk_bar_stocktake_lines_stock_item_id_bar_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `bar_stock_items`(`id`),
	CONSTRAINT `fk_bar_stocktake_lines_variance_reason_term_core_terms_id_fk` FOREIGN KEY (`variance_reason_term`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "bar_stocktake_lines_counted" CHECK("counted" IS NULL OR "counted" >= 0)
);
--> statement-breakpoint
CREATE TABLE `bar_stocktakes` (
	`id` text PRIMARY KEY,
	`location_id` text NOT NULL,
	`state` text NOT NULL,
	`scope` text NOT NULL,
	`category_id` text,
	`started_by` text NOT NULL,
	`submitted_by` text,
	`approved_by` text,
	`started_at` integer NOT NULL,
	`submitted_at` integer,
	`approved_at` integer,
	`variance_value_minor` integer,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_stocktakes_location_id_bar_stock_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `bar_stock_locations`(`id`),
	CONSTRAINT `fk_bar_stocktakes_category_id_bar_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `bar_categories`(`id`),
	CONSTRAINT "bar_stocktakes_state" CHECK("state" IN ('counting', 'submitted', 'approved', 'abandoned')),
	CONSTRAINT "bar_stocktakes_scope" CHECK("scope" IN ('full', 'category') AND ("scope" = 'category') = ("category_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `bar_variants` (
	`id` text PRIMARY KEY,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`barcode` text,
	`mixer_measure` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_variants_product_id_bar_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `bar_products`(`id`)
);
--> statement-breakpoint
CREATE TABLE `box_office_bands` (
	`id` text PRIMARY KEY,
	`production_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'standard' NOT NULL,
	`displaces_band_id` text,
	`displaces_units` integer DEFAULT 2 NOT NULL,
	`seats` integer,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_bands_displaces_band_id_box_office_bands_id_fk` FOREIGN KEY (`displaces_band_id`) REFERENCES `box_office_bands`(`id`),
	CONSTRAINT "box_office_bands_kind" CHECK("kind" IN ('standard', 'wheelchair', 'restricted_view')),
	CONSTRAINT "box_office_bands_displaces" CHECK("displaces_units" >= 1 AND ("displaces_band_id" IS NULL OR "kind" = 'wheelchair'))
);
--> statement-breakpoint
CREATE TABLE `box_office_cancellations` (
	`id` text PRIMARY KEY,
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`reason_term_id` text,
	`note` text,
	`line_ids` text NOT NULL,
	`refund_id` text,
	`fee_minor` integer DEFAULT 0 NOT NULL,
	`by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_cancellations_order_id_box_office_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `box_office_orders`(`id`),
	CONSTRAINT `fk_box_office_cancellations_reason_term_id_core_terms_id_fk` FOREIGN KEY (`reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT `fk_box_office_cancellations_refund_id_payments_refunds_id_fk` FOREIGN KEY (`refund_id`) REFERENCES `payments_refunds`(`id`),
	CONSTRAINT "box_office_cancellations_kind" CHECK("kind" IN ('customer', 'staff', 'performance_cancelled', 'exchange', 'unfulfilled_payment')),
	CONSTRAINT "box_office_cancellations_note" CHECK("note" IS NULL OR length("note") <= 200),
	CONSTRAINT "box_office_cancellations_fee" CHECK("fee_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `box_office_claims` (
	`id` text PRIMARY KEY,
	`pool_id` text NOT NULL,
	`seat_id` text,
	`hold_id` text NOT NULL,
	`displaced_for_id` text,
	`state` text NOT NULL,
	`expires_at` integer,
	`released_at` integer,
	`release_reason` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_claims_pool_id_box_office_pools_id_fk` FOREIGN KEY (`pool_id`) REFERENCES `box_office_pools`(`id`),
	CONSTRAINT `fk_box_office_claims_hold_id_box_office_holds_id_fk` FOREIGN KEY (`hold_id`) REFERENCES `box_office_holds`(`id`),
	CONSTRAINT `fk_box_office_claims_displaced_for_id_box_office_claims_id_fk` FOREIGN KEY (`displaced_for_id`) REFERENCES `box_office_claims`(`id`),
	CONSTRAINT "box_office_claims_state" CHECK("state" IN ('held', 'confirmed', 'released')),
	CONSTRAINT "box_office_claims_released" CHECK(("state" = 'released') = ("released_at" IS NOT NULL) AND ("state" = 'released') = ("release_reason" IS NOT NULL)),
	CONSTRAINT "box_office_claims_reason" CHECK("release_reason" IS NULL OR "release_reason" IN ('expired', 'abandoned', 'cancelled', 'exchanged', 'staff', 'payment_failed')),
	CONSTRAINT "box_office_claims_confirmed" CHECK("state" <> 'confirmed' OR "expires_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE `box_office_comp_requests` (
	`id` text PRIMARY KEY,
	`performance_id` text NOT NULL,
	`band_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`for_account_id` text NOT NULL,
	`reason_term_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`state` text DEFAULT 'requested' NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`order_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_comp_requests_band_id_box_office_bands_id_fk` FOREIGN KEY (`band_id`) REFERENCES `box_office_bands`(`id`),
	CONSTRAINT `fk_box_office_comp_requests_reason_term_id_core_terms_id_fk` FOREIGN KEY (`reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT `fk_box_office_comp_requests_order_id_box_office_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `box_office_orders`(`id`),
	CONSTRAINT "box_office_comp_requests_quantity" CHECK("quantity" > 0),
	CONSTRAINT "box_office_comp_requests_state" CHECK("state" IN ('requested', 'approved', 'declined', 'issued', 'withdrawn')),
	CONSTRAINT "box_office_comp_requests_not_own" CHECK("decided_by" IS NULL OR "decided_by" <> "requested_by")
);
--> statement-breakpoint
CREATE TABLE `box_office_exchanges` (
	`id` text PRIMARY KEY,
	`order_id` text NOT NULL,
	`line_ids` text NOT NULL,
	`performance_id` text NOT NULL,
	`band_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`price_minor` integer NOT NULL,
	`moves` text,
	`difference_minor` integer NOT NULL,
	`hold_id` text NOT NULL,
	`intent_id` text,
	`state` text DEFAULT 'awaiting_payment' NOT NULL,
	`cancellation_id` text,
	`by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_exchanges_order_id_box_office_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `box_office_orders`(`id`),
	CONSTRAINT `fk_box_office_exchanges_band_id_box_office_bands_id_fk` FOREIGN KEY (`band_id`) REFERENCES `box_office_bands`(`id`),
	CONSTRAINT `fk_box_office_exchanges_ticket_type_id_box_office_ticket_types_id_fk` FOREIGN KEY (`ticket_type_id`) REFERENCES `box_office_ticket_types`(`id`),
	CONSTRAINT `fk_box_office_exchanges_hold_id_box_office_holds_id_fk` FOREIGN KEY (`hold_id`) REFERENCES `box_office_holds`(`id`),
	CONSTRAINT `fk_box_office_exchanges_intent_id_payments_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `payments_intents`(`id`),
	CONSTRAINT `fk_box_office_exchanges_cancellation_id_box_office_cancellations_id_fk` FOREIGN KEY (`cancellation_id`) REFERENCES `box_office_cancellations`(`id`),
	CONSTRAINT "box_office_exchanges_state" CHECK("state" IN ('awaiting_payment', 'completed', 'released')),
	CONSTRAINT "box_office_exchanges_difference" CHECK("difference_minor" > 0 AND "price_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE `box_office_holds` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`order_id` text,
	`label` text,
	`held_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_holds_order_id_box_office_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `box_office_orders`(`id`),
	CONSTRAINT "box_office_holds_kind" CHECK("kind" IN ('basket', 'payment', 'reservation', 'staff', 'waitlist_offer')),
	CONSTRAINT "box_office_holds_owner" CHECK(("kind" = 'staff') = ("order_id" IS NULL)),
	CONSTRAINT "box_office_holds_label" CHECK("label" IS NULL OR ("kind" = 'staff' AND length("label") <= 80))
);
--> statement-breakpoint
CREATE TABLE `box_office_order_lines` (
	`id` text PRIMARY KEY,
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`performance_id` text,
	`band_id` text,
	`ticket_type_id` text,
	`claim_id` text,
	`price_id` text,
	`list_minor` integer NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`amount_minor` integer NOT NULL,
	`promo_redemption_id` text,
	`pass_redemption_id` text,
	`comp_request_id` text,
	`requirement_ref` text,
	`requirement_account_id` text,
	`requirement_evidence_id` text,
	`state` text DEFAULT 'live' NOT NULL,
	`replaces_line_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_order_lines_order_id_box_office_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `box_office_orders`(`id`),
	CONSTRAINT `fk_box_office_order_lines_band_id_box_office_bands_id_fk` FOREIGN KEY (`band_id`) REFERENCES `box_office_bands`(`id`),
	CONSTRAINT `fk_box_office_order_lines_ticket_type_id_box_office_ticket_types_id_fk` FOREIGN KEY (`ticket_type_id`) REFERENCES `box_office_ticket_types`(`id`),
	CONSTRAINT `fk_box_office_order_lines_claim_id_box_office_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `box_office_claims`(`id`),
	CONSTRAINT `fk_box_office_order_lines_price_id_box_office_prices_id_fk` FOREIGN KEY (`price_id`) REFERENCES `box_office_prices`(`id`),
	CONSTRAINT `fk_box_office_order_lines_replaces_line_id_box_office_order_lines_id_fk` FOREIGN KEY (`replaces_line_id`) REFERENCES `box_office_order_lines`(`id`),
	CONSTRAINT "box_office_order_lines_kind" CHECK("kind" IN ('ticket', 'booking_fee', 'donation', 'pass_sale', 'exchange_fee', 'adjustment')),
	CONSTRAINT "box_office_order_lines_ticket" CHECK("kind" <> 'ticket' OR ("performance_id" IS NOT NULL AND "band_id" IS NOT NULL AND "ticket_type_id" IS NOT NULL AND "claim_id" IS NOT NULL)),
	CONSTRAINT "box_office_order_lines_list" CHECK("list_minor" >= 0),
	CONSTRAINT "box_office_order_lines_discount" CHECK("discount_minor" >= 0 AND "discount_minor" <= "list_minor"),
	CONSTRAINT "box_office_order_lines_amount" CHECK("amount_minor" = "list_minor" - "discount_minor"),
	CONSTRAINT "box_office_order_lines_one_discount" CHECK("promo_redemption_id" IS NULL OR "pass_redemption_id" IS NULL),
	CONSTRAINT "box_office_order_lines_state" CHECK("state" IN ('live', 'cancelled', 'exchanged'))
);
--> statement-breakpoint
CREATE TABLE `box_office_orders` (
	`id` text PRIMARY KEY,
	`reference` text NOT NULL,
	`channel` text NOT NULL,
	`state` text NOT NULL,
	`account_id` text,
	`signed_in` integer DEFAULT false NOT NULL,
	`terms_version_id` text,
	`access_note` text,
	`currency` text NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`sold_by` text,
	`session_id` text,
	`intent_id` text,
	`basket_token_hash` text,
	`confirm_token_hash` text,
	`confirm_expires_at` integer,
	`confirm_email` text,
	`confirm_name` text,
	`link_token_expires_at` integer,
	`link_token_hash` text,
	`desk_code_hash` text,
	`expires_at` integer,
	`extended_at` integer,
	`release_at` integer,
	`keep` integer DEFAULT false NOT NULL,
	`admit_on_payment` integer DEFAULT false NOT NULL,
	`reserved_at` integer,
	`split_from_id` text,
	`confirmed_at` integer,
	`cancelled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_orders_terms_version_id_core_policy_versions_id_fk` FOREIGN KEY (`terms_version_id`) REFERENCES `core_policy_versions`(`id`),
	CONSTRAINT `fk_box_office_orders_session_id_payments_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `payments_sessions`(`id`),
	CONSTRAINT `fk_box_office_orders_intent_id_payments_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `payments_intents`(`id`),
	CONSTRAINT `fk_box_office_orders_split_from_id_box_office_orders_id_fk` FOREIGN KEY (`split_from_id`) REFERENCES `box_office_orders`(`id`),
	CONSTRAINT "box_office_orders_channel" CHECK("channel" IN ('online', 'desk', 'phone')),
	CONSTRAINT "box_office_orders_state" CHECK("state" IN ('basket', 'reserved', 'awaiting_payment', 'confirmed', 'cancelled', 'expired')),
	CONSTRAINT "box_office_orders_total" CHECK("total_minor" >= 0),
	CONSTRAINT "box_office_orders_account_needed" CHECK("account_id" IS NOT NULL OR "state" IN ('basket', 'expired') OR ("channel" = 'desk' AND "access_note" IS NULL AND "state" <> 'reserved'))
);
--> statement-breakpoint
CREATE TABLE `box_office_pass_prices` (
	`id` text PRIMARY KEY,
	`pass_type_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`requirement_refs` text,
	`proof_note` text,
	`instead_of` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_pass_prices_pass_type_id_box_office_pass_types_id_fk` FOREIGN KEY (`pass_type_id`) REFERENCES `box_office_pass_types`(`id`),
	CONSTRAINT "box_office_pass_prices_name_length" CHECK(length("name") BETWEEN 1 AND 60),
	CONSTRAINT "box_office_pass_prices_amount" CHECK("amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `box_office_pass_redemptions` (
	`id` text PRIMARY KEY,
	`pass_id` text NOT NULL,
	`production_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`order_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`once` integer DEFAULT true NOT NULL,
	`state` text DEFAULT 'live' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_pass_redemptions_pass_id_box_office_passes_id_fk` FOREIGN KEY (`pass_id`) REFERENCES `box_office_passes`(`id`),
	CONSTRAINT "box_office_pass_redemptions_state" CHECK("state" IN ('live', 'released'))
);
--> statement-breakpoint
CREATE TABLE `box_office_pass_shows` (
	`id` text PRIMARY KEY,
	`pass_type_id` text NOT NULL,
	`production_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_pass_shows_pass_type_id_box_office_pass_types_id_fk` FOREIGN KEY (`pass_type_id`) REFERENCES `box_office_pass_types`(`id`)
);
--> statement-breakpoint
CREATE TABLE `box_office_pass_types` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`covers` text DEFAULT 'productions' NOT NULL,
	`season_id` text,
	`covers_from` integer,
	`covers_until` integer,
	`per_show` text DEFAULT 'once' NOT NULL,
	`uses` integer,
	`holder` text DEFAULT 'auto' NOT NULL,
	`reserve_unpaid` integer DEFAULT true NOT NULL,
	`recheck` integer DEFAULT false NOT NULL,
	`channel` text DEFAULT 'all' NOT NULL,
	`on_sale` integer DEFAULT false NOT NULL,
	`sale_from` integer,
	`sale_until` integer,
	`active` integer DEFAULT true NOT NULL,
	`currency` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "box_office_pass_types_name_length" CHECK(length("name") BETWEEN 1 AND 80),
	CONSTRAINT "box_office_pass_types_covers" CHECK("covers" IN ('productions', 'season', 'dates') AND ("covers" <> 'season' OR "season_id" IS NOT NULL) AND ("covers" <> 'dates' OR ("covers_from" IS NOT NULL AND "covers_until" IS NOT NULL AND "covers_until" > "covers_from"))),
	CONSTRAINT "box_office_pass_types_per_show" CHECK("per_show" IN ('once', 'any')),
	CONSTRAINT "box_office_pass_types_uses" CHECK("uses" IS NULL OR "uses" > 0),
	CONSTRAINT "box_office_pass_types_holder" CHECK("holder" IN ('auto', 'named', 'open')),
	CONSTRAINT "box_office_pass_types_channel" CHECK("channel" IN ('all', 'desk', 'online'))
);
--> statement-breakpoint
CREATE TABLE `box_office_passes` (
	`id` text PRIMARY KEY,
	`pass_type_id` text NOT NULL,
	`pass_price_id` text NOT NULL,
	`order_line_id` text,
	`account_id` text,
	`named` integer DEFAULT false NOT NULL,
	`code_hash` text NOT NULL,
	`alias_hash` text,
	`code` text,
	`uses_total` integer,
	`uses_taken` integer DEFAULT 0 NOT NULL,
	`once` integer DEFAULT true NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`issued_at` integer,
	`paid_at` integer,
	`state` text DEFAULT 'active' NOT NULL,
	`issued_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_passes_pass_type_id_box_office_pass_types_id_fk` FOREIGN KEY (`pass_type_id`) REFERENCES `box_office_pass_types`(`id`),
	CONSTRAINT `fk_box_office_passes_pass_price_id_box_office_pass_prices_id_fk` FOREIGN KEY (`pass_price_id`) REFERENCES `box_office_pass_prices`(`id`),
	CONSTRAINT `fk_box_office_passes_order_line_id_box_office_order_lines_id_fk` FOREIGN KEY (`order_line_id`) REFERENCES `box_office_order_lines`(`id`),
	CONSTRAINT "box_office_passes_state" CHECK("state" IN ('active', 'void')),
	CONSTRAINT "box_office_passes_amount" CHECK("amount_minor" >= 0),
	CONSTRAINT "box_office_passes_uses" CHECK("uses_taken" >= 0 AND ("uses_total" IS NULL OR "uses_taken" <= "uses_total")),
	CONSTRAINT "box_office_passes_named" CHECK("named" = 0 OR "account_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `box_office_performance_sales` (
	`id` text PRIMARY KEY,
	`performance_id` text NOT NULL,
	`seating` text DEFAULT 'general' NOT NULL,
	`plan_id` text,
	`layout_id` text,
	`wheelchair_spaces` integer,
	`seats_per_space` integer,
	`layout_own` integer DEFAULT false NOT NULL,
	`seats_band_id` text,
	`kept_released_at` integer,
	`kept_released_by` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`on_sale_at` integer,
	`off_sale_at` integer,
	`max_per_order` integer,
	`hold_minutes` integer,
	`release_minutes` integer,
	`payment_timing` text,
	`change_decision` text,
	`change_decided_by` text,
	`change_decided_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "box_office_performance_sales_seating" CHECK("seating" IN ('general', 'allocated')),
	CONSTRAINT "box_office_performance_sales_plan" CHECK("seating" = 'general' OR "plan_id" IS NOT NULL),
	CONSTRAINT "box_office_performance_sales_state" CHECK("state" IN ('draft', 'on_sale', 'paused', 'closed')),
	CONSTRAINT "box_office_performance_sales_cap" CHECK("max_per_order" IS NULL OR "max_per_order" > 0),
	CONSTRAINT "box_office_performance_sales_hold" CHECK("hold_minutes" IS NULL OR "hold_minutes" > 0),
	CONSTRAINT "box_office_performance_sales_timing" CHECK("payment_timing" IS NULL OR "payment_timing" IN ('pay-now', 'reserve', 'buyer-chooses')),
	CONSTRAINT "box_office_performance_sales_decision" CHECK("change_decision" IS NULL OR "change_decision" IN ('refund_all', 'offer_exchange', 'keep'))
);
--> statement-breakpoint
CREATE TABLE `box_office_pools` (
	`id` text PRIMARY KEY,
	`performance_id` text NOT NULL,
	`band_id` text NOT NULL,
	`capacity` integer NOT NULL,
	`claimed` integer DEFAULT 0 NOT NULL,
	`over_venue_confirmed_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_pools_band_id_box_office_bands_id_fk` FOREIGN KEY (`band_id`) REFERENCES `box_office_bands`(`id`),
	CONSTRAINT "box_office_pools_capacity" CHECK("capacity" >= 0),
	CONSTRAINT "box_office_pools_claimed" CHECK("claimed" >= 0 AND "claimed" <= "capacity")
);
--> statement-breakpoint
CREATE TABLE `box_office_prices` (
	`id` text PRIMARY KEY,
	`production_id` text NOT NULL,
	`performance_id` text,
	`band_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`amount_minor` integer,
	`inherits` integer DEFAULT false NOT NULL,
	`currency` text NOT NULL,
	`effective_from` integer NOT NULL,
	`set_by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_prices_band_id_box_office_bands_id_fk` FOREIGN KEY (`band_id`) REFERENCES `box_office_bands`(`id`),
	CONSTRAINT `fk_box_office_prices_ticket_type_id_box_office_ticket_types_id_fk` FOREIGN KEY (`ticket_type_id`) REFERENCES `box_office_ticket_types`(`id`),
	CONSTRAINT "box_office_prices_amount" CHECK("amount_minor" IS NULL OR "amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `box_office_run_layouts` (
	`id` text PRIMARY KEY,
	`production_id` text NOT NULL,
	`layout_id` text,
	`wheelchair_spaces` integer,
	`seats_per_space` integer,
	`seats_band_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "box_office_run_layouts_choice" CHECK(("layout_id" IS NOT NULL AND "wheelchair_spaces" IS NULL AND "seats_per_space" IS NULL) OR ("layout_id" IS NULL AND "wheelchair_spaces" >= 0 AND "seats_per_space" >= 0))
);
--> statement-breakpoint
CREATE TABLE `box_office_scans` (
	`id` text PRIMARY KEY,
	`ticket_id` text,
	`performance_id` text NOT NULL,
	`result` text NOT NULL,
	`reason_term_id` text,
	`unchecked` integer DEFAULT false NOT NULL,
	`scanned_by` text NOT NULL,
	`device_label` text,
	`scanned_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`offline` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_box_office_scans_ticket_id_box_office_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `box_office_tickets`(`id`),
	CONSTRAINT `fk_box_office_scans_reason_term_id_core_terms_id_fk` FOREIGN KEY (`reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "box_office_scans_result" CHECK("result" IN ('admitted', 'admitted_by_override', 'already_admitted', 'void', 'wrong_performance', 'requirement_not_met', 'unknown', 'bad_signature', 'reversed')),
	CONSTRAINT "box_office_scans_reason" CHECK("result" NOT IN ('reversed', 'admitted_by_override') OR "reason_term_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `box_office_seating_layouts` (
	`id` text PRIMARY KEY,
	`space_id` text NOT NULL,
	`name` text NOT NULL,
	`seats` integer,
	`wheelchair_spaces` integer DEFAULT 0 NOT NULL,
	`seats_per_space` integer DEFAULT 2 NOT NULL,
	`seats_section` text,
	`usual` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "box_office_seating_layouts_name_length" CHECK(length("name") BETWEEN 1 AND 80),
	CONSTRAINT "box_office_seating_layouts_numbers" CHECK(("seats" IS NULL OR "seats" >= 0) AND "wheelchair_spaces" >= 0 AND "seats_per_space" >= 0)
);
--> statement-breakpoint
CREATE TABLE `box_office_space_ticket_presets` (
	`id` text PRIMARY KEY,
	`space_id` text NOT NULL,
	`preset_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_space_ticket_presets_preset_id_box_office_ticket_presets_id_fk` FOREIGN KEY (`preset_id`) REFERENCES `box_office_ticket_presets`(`id`)
);
--> statement-breakpoint
CREATE TABLE `box_office_ticket_presets` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`sections` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "box_office_ticket_presets_name_length" CHECK(length("name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE `box_office_ticket_types` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`kind` text DEFAULT 'standard' NOT NULL,
	`requirement_refs` text,
	`recheck_at_entry` integer DEFAULT true NOT NULL,
	`max_per_holder` integer DEFAULT 1 NOT NULL,
	`proof_note` text,
	`needs_paid_ticket` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`channel` text DEFAULT 'all' NOT NULL,
	`managed_by` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "box_office_ticket_types_kind" CHECK("kind" IN ('standard', 'concession', 'companion', 'complimentary')),
	CONSTRAINT "box_office_ticket_types_holder" CHECK("max_per_holder" >= 1)
);
--> statement-breakpoint
CREATE TABLE `box_office_tickets` (
	`id` text PRIMARY KEY,
	`order_line_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`door_code` text,
	`key_id` text NOT NULL,
	`state` text DEFAULT 'valid' NOT NULL,
	`void_reason` text,
	`attendee_name` text,
	`admitted_at` integer,
	`admitted_scan_id` text,
	`requirement_ref` text,
	`requirement_account_id` text,
	`requirement_evidence_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_tickets_order_line_id_box_office_order_lines_id_fk` FOREIGN KEY (`order_line_id`) REFERENCES `box_office_order_lines`(`id`),
	CONSTRAINT "box_office_tickets_state" CHECK("state" IN ('valid', 'void')),
	CONSTRAINT "box_office_tickets_void" CHECK(("state" = 'void') = ("void_reason" IS NOT NULL)),
	CONSTRAINT "box_office_tickets_reason" CHECK("void_reason" IS NULL OR "void_reason" IN ('cancelled', 'exchanged', 'reissued', 'performance_cancelled')),
	CONSTRAINT "box_office_tickets_requirement" CHECK("requirement_ref" IS NULL OR "requirement_account_id" IS NOT NULL OR "requirement_evidence_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `core_access_profiles` (
	`account_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`payload` text,
	`pending` text,
	`message` text,
	`submitted_at` integer NOT NULL,
	`submitted_via` text NOT NULL,
	`submitted_by` text,
	`decided_at` integer,
	`decided_by` text,
	`verified_at` integer,
	`verified_by` text,
	`verified_method` text,
	`verified_companions` integer,
	`review_due` integer,
	`reminders` integer DEFAULT 0 NOT NULL,
	`flagged_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT "core_access_profiles_payload_when_accepted" CHECK((status = 'accepted') = (payload IS NOT NULL)),
	CONSTRAINT "core_access_profiles_verified_when_accepted" CHECK(verified_at IS NULL OR status = 'accepted')
);
--> statement-breakpoint
CREATE TABLE `core_access_shares` (
	`account_id` text NOT NULL,
	`purpose` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `core_access_shares_pk` PRIMARY KEY(`account_id`, `purpose`)
);
--> statement-breakpoint
CREATE TABLE `core_account_emails` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`address` text NOT NULL,
	`verified_at` integer,
	`added_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `core_account_merge_items` (
	`merge_id` text NOT NULL,
	`table_name` text NOT NULL,
	`column_name` text NOT NULL,
	`row_id` text NOT NULL,
	`action` text NOT NULL,
	CONSTRAINT `core_account_merge_items_pk` PRIMARY KEY(`merge_id`, `table_name`, `column_name`, `row_id`),
	CONSTRAINT `fk_core_account_merge_items_merge_id_core_account_merges_id_fk` FOREIGN KEY (`merge_id`) REFERENCES `core_account_merges`(`id`)
);
--> statement-breakpoint
CREATE TABLE `core_account_merges` (
	`id` text PRIMARY KEY,
	`survivor_id` text NOT NULL,
	`merged_account_id` text NOT NULL,
	`started_by` text NOT NULL,
	`performed_by` text NOT NULL,
	`performed_at` integer NOT NULL,
	`undo_until` integer NOT NULL,
	`completed_at` integer,
	`undo_started_at` integer,
	`undone_at` integer,
	`undone_by` text,
	`closed_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_account_tokens` (
	`id` text PRIMARY KEY,
	`purpose` text NOT NULL,
	`token_hash` text NOT NULL,
	`code_hash` text,
	`browser_hash` text,
	`account_id` text,
	`address` text,
	`issued_by` text,
	`next_path` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_accounts` (
	`id` text PRIMARY KEY,
	`name` text,
	`preferred_name` text,
	`pronouns` text,
	`phone` text,
	`locale` text,
	`audience_email_id` text,
	`members_email_id` text,
	`origin` text NOT NULL,
	`created_at` integer NOT NULL,
	`first_signed_in_at` integer,
	`terms_version_id` text,
	`last_signed_in_at` integer,
	`disabled_at` integer,
	`disabled_reason` text,
	`merged_into_id` text,
	`merged_at` integer,
	`anonymised_at` integer,
	CONSTRAINT `fk_core_accounts_terms_version_id_core_policy_versions_id_fk` FOREIGN KEY (`terms_version_id`) REFERENCES `core_policy_versions`(`id`),
	CONSTRAINT "core_accounts_not_merged_into_itself" CHECK(merged_into_id IS NULL OR merged_into_id <> id),
	CONSTRAINT "core_accounts_name_length" CHECK(name IS NULL OR length(name) BETWEEN 1 AND 120),
	CONSTRAINT "core_accounts_preferred_name_length" CHECK(preferred_name IS NULL OR length(preferred_name) <= 60),
	CONSTRAINT "core_accounts_pronouns_length" CHECK(pronouns IS NULL OR length(pronouns) BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE TABLE `core_audit` (
	`id` text PRIMARY KEY,
	`at` integer NOT NULL,
	`actor_account_id` text,
	`actor_name` text,
	`actor_kind` text NOT NULL,
	`action` text NOT NULL,
	`ability` text,
	`allowed_by` text,
	`module_id` text,
	`record_type` text,
	`record_id` text,
	`detail` text,
	`request_id` text,
	`unit_id` text
);
--> statement-breakpoint
CREATE TABLE `core_authenticators` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`secret_sealed` text NOT NULL,
	`last_step` integer DEFAULT 0 NOT NULL,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_closures` (
	`id` text PRIMARY KEY,
	`venue_id` text,
	`space_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`all_day` integer DEFAULT false NOT NULL,
	`blocks_performances` integer NOT NULL,
	`source` text NOT NULL,
	`feed_ref` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_core_closures_venue_id_core_venues_id_fk` FOREIGN KEY (`venue_id`) REFERENCES `core_venues`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_closures_space_id_venue_id_core_spaces_id_venue_id_fk` FOREIGN KEY (`space_id`,`venue_id`) REFERENCES `core_spaces`(`id`,`venue_id`) ON DELETE CASCADE,
	CONSTRAINT "core_closures_kind" CHECK("kind" IN ('closure', 'public_holiday')),
	CONSTRAINT "core_closures_source" CHECK("source" IN ('manual', 'feed')),
	CONSTRAINT "core_closures_scope" CHECK("space_id" IS NULL OR "venue_id" IS NOT NULL),
	CONSTRAINT "core_closures_period" CHECK("ends_at" > "starts_at"),
	CONSTRAINT "core_closures_title" CHECK(length("title") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE TABLE `core_credentials` (
	`module_id` text NOT NULL,
	`name` text NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`ciphertext` text NOT NULL,
	`key_version` integer NOT NULL,
	`set_at` integer NOT NULL,
	`set_by` text,
	`last_used_at` integer,
	`expires_at` integer,
	`hint` text,
	CONSTRAINT `core_credentials_pk` PRIMARY KEY(`module_id`, `name`, `scope`)
);
--> statement-breakpoint
CREATE TABLE `core_data_request_checks` (
	`request_id` text NOT NULL,
	`table_name` text NOT NULL,
	`outcome` text NOT NULL,
	`ticked_by` text NOT NULL,
	`ticked_at` integer NOT NULL,
	CONSTRAINT `core_data_request_checks_pk` PRIMARY KEY(`request_id`, `table_name`),
	CONSTRAINT `fk_core_data_request_checks_request_id_core_data_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `core_data_requests`(`id`)
);
--> statement-breakpoint
CREATE TABLE `core_data_requests` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` integer NOT NULL,
	`identity_check` text,
	`respond_by` integer NOT NULL,
	`not_before` integer,
	`holds` text,
	`file_id` text,
	`finished_at` integer,
	`closed_at` integer,
	`closed_by` text
);
--> statement-breakpoint
CREATE TABLE `core_email_events_set_aside` (
	`queue_message_id` text PRIMARY KEY,
	`event_type` text,
	`reason` text NOT NULL,
	`set_aside_at` integer NOT NULL,
	CONSTRAINT "core_email_events_set_aside_type" CHECK("event_type" IS NULL OR "event_type" IN ('delivered', 'deferred', 'bounced', 'failed', 'rejected', 'complained')),
	CONSTRAINT "core_email_events_set_aside_reason" CHECK("reason" IN ('unreadable', 'unmatched'))
);
--> statement-breakpoint
CREATE TABLE `core_email_suppressions` (
	`address_hash` text PRIMARY KEY,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`lifted_at` integer,
	`lifted_by` text,
	CONSTRAINT "core_email_suppressions_reason" CHECK("reason" IN ('hard_bounce', 'complaint', 'manual'))
);
--> statement-breakpoint
CREATE TABLE `core_emergency_contacts` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`relationship` text,
	`phone` text NOT NULL,
	`updated_at` integer NOT NULL,
	`standing_lost_at` integer,
	CONSTRAINT "core_emergency_contacts_relationship" CHECK("relationship" IS NULL OR length("relationship") BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE TABLE `core_events` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`record_type` text,
	`record_id` text,
	`payload` text NOT NULL,
	`announced_at` integer NOT NULL,
	`unit_id` text NOT NULL,
	`dispatched_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_external_calls` (
	`id` text PRIMARY KEY,
	`module_id` text NOT NULL,
	`purpose` text NOT NULL,
	`reference` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`phase` text NOT NULL,
	`result` text,
	`provider_reference` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `core_fact_abilities` (
	`fact` text NOT NULL,
	`ability` text NOT NULL,
	`pinned_record` text DEFAULT '' NOT NULL,
	`confirmed_privileged_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `core_fact_abilities_pk` PRIMARY KEY(`fact`, `ability`, `pinned_record`)
);
--> statement-breakpoint
CREATE TABLE `core_federated_identities` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`hosted_domain` text,
	`email_id` text,
	`linked_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_files` (
	`id` text PRIMARY KEY,
	`object_key` text NOT NULL UNIQUE,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`slot` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`original_name` text,
	`text_class` text NOT NULL,
	`title` text,
	`alt_text` text,
	`media_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`width` integer,
	`height` integer,
	`access` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`rejected_reason` text,
	`uploaded_by` text,
	`created_at` integer NOT NULL,
	`ready_at` integer,
	`attached_at` integer,
	`deleted_at` integer,
	`purge_after` integer,
	`expires_at` integer,
	CONSTRAINT "core_files_byte_size" CHECK("byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE `core_grant_ends` (
	`grant_id` text NOT NULL,
	`ended_at` integer NOT NULL,
	`ended_by` text,
	`ended_reason` text NOT NULL,
	CONSTRAINT `fk_core_grant_ends_grant_id_core_grants_id_fk` FOREIGN KEY (`grant_id`) REFERENCES `core_grants`(`id`)
);
--> statement-breakpoint
CREATE TABLE `core_grant_warnings` (
	`grant_id` text PRIMARY KEY,
	`warned_at` integer NOT NULL,
	CONSTRAINT `fk_core_grant_warnings_grant_id_core_grants_id_fk` FOREIGN KEY (`grant_id`) REFERENCES `core_grants`(`id`)
);
--> statement-breakpoint
CREATE TABLE `core_grants` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`role_id` text NOT NULL,
	`scope` text NOT NULL,
	`scope_module` text,
	`scope_type` text,
	`scope_id` text,
	`starts_at` integer NOT NULL,
	`expires_at` integer,
	`granted_by` text NOT NULL,
	`granted_at` integer NOT NULL,
	CONSTRAINT `fk_core_grants_role_id_core_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `core_roles`(`id`),
	CONSTRAINT "core_grants_scope" CHECK((scope = 'site' AND scope_module IS NULL AND scope_type IS NULL AND scope_id IS NULL)
      OR (scope = 'module' AND scope_module IS NOT NULL AND scope_type IS NULL AND scope_id IS NULL)
      OR (scope = 'record' AND scope_module IS NOT NULL AND scope_type IS NOT NULL AND scope_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `core_guard` (
	`ok` integer NOT NULL,
	`code` text
);
--> statement-breakpoint
CREATE TABLE `core_idempotency_keys` (
	`key` text NOT NULL,
	`route` text NOT NULL,
	`account_id` text,
	`request_hash` text NOT NULL,
	`status` integer NOT NULL,
	`response` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `core_idempotency_keys_pk` PRIMARY KEY(`key`, `route`)
);
--> statement-breakpoint
CREATE TABLE `core_inbox_items` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`delivery_id` text,
	`side` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`read_at` integer,
	`archived_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_core_inbox_items_delivery_id_core_notification_deliveries_id_fk` FOREIGN KEY (`delivery_id`) REFERENCES `core_notification_deliveries`(`id`) ON DELETE SET NULL,
	CONSTRAINT "core_inbox_items_side" CHECK("side" IN ('audience', 'members')),
	CONSTRAINT "core_inbox_items_title" CHECK(length("title") BETWEEN 1 AND 120),
	CONSTRAINT "core_inbox_items_body" CHECK("body" IS NULL OR length("body") <= 500)
);
--> statement-breakpoint
CREATE TABLE `core_jobs` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`module_id` text,
	`lane` text NOT NULL,
	`payload` text NOT NULL,
	`dedupe_key` text,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`deferrals` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer NOT NULL,
	`run_after` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_migrations` (
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`checksum` text NOT NULL,
	`applied_at` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`release` text NOT NULL,
	CONSTRAINT `core_migrations_pk` PRIMARY KEY(`owner`, `name`)
);
--> statement-breakpoint
CREATE TABLE `core_module_defaults` (
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`module_id` text NOT NULL,
	`offered_at` integer NOT NULL,
	CONSTRAINT `core_module_defaults_pk` PRIMARY KEY(`kind`, `key`)
);
--> statement-breakpoint
CREATE TABLE `core_modules` (
	`module_id` text PRIMARY KEY,
	`enabled` integer DEFAULT false NOT NULL,
	`enabled_at` integer,
	`disabled_at` integer,
	`changed_by` text,
	`manifest_seen` text
);
--> statement-breakpoint
CREATE TABLE `core_notification_deliveries` (
	`id` text PRIMARY KEY,
	`notification_id` text NOT NULL,
	`side` text NOT NULL,
	`channel` text NOT NULL,
	`state` text NOT NULL,
	`reason` text,
	`template_id` text,
	`sender_key` text,
	`provider_ref` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`rolled_into_id` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_core_notification_deliveries_notification_id_core_notifications_id_fk` FOREIGN KEY (`notification_id`) REFERENCES `core_notifications`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_notification_deliveries_sender_key_core_sender_identities_key_fk` FOREIGN KEY (`sender_key`) REFERENCES `core_sender_identities`(`key`) ON DELETE RESTRICT,
	CONSTRAINT `fk_core_notification_deliveries_rolled_into_id_core_notifications_id_fk` FOREIGN KEY (`rolled_into_id`) REFERENCES `core_notifications`(`id`) ON DELETE SET NULL,
	CONSTRAINT "core_notification_deliveries_side" CHECK("side" IN ('audience', 'members')),
	CONSTRAINT "core_notification_deliveries_state" CHECK("state" IN ('queued', 'held', 'sending', 'sent', 'retrying', 'failed', 'suppressed', 'skipped', 'bounced', 'complained'))
);
--> statement-breakpoint
CREATE TABLE `core_notification_preferences` (
	`account_id` text NOT NULL,
	`topic_key` text NOT NULL,
	`channel` text NOT NULL,
	`side` text NOT NULL,
	`enabled` integer NOT NULL,
	`digest` text DEFAULT 'immediate' NOT NULL,
	CONSTRAINT `core_notification_preferences_pk` PRIMARY KEY(`account_id`, `topic_key`, `channel`),
	CONSTRAINT "core_notification_preferences_side" CHECK("side" IN ('audience', 'members')),
	CONSTRAINT "core_notification_preferences_digest" CHECK("digest" IN ('immediate', 'daily', 'weekly'))
);
--> statement-breakpoint
CREATE TABLE `core_notification_routing` (
	`topic_key` text PRIMARY KEY,
	`sender_key` text NOT NULL,
	CONSTRAINT `fk_core_notification_routing_sender_key_core_sender_identities_key_fk` FOREIGN KEY (`sender_key`) REFERENCES `core_sender_identities`(`key`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `core_notifications` (
	`id` text PRIMARY KEY,
	`type_key` text NOT NULL,
	`side` text NOT NULL,
	`account_id` text,
	`address` text,
	`locale` text NOT NULL,
	`subject_type` text,
	`subject_id` text,
	`dedupe_key` text,
	`coalesce_key` text,
	`payload` text,
	`sealed_variables` text,
	`actor_id` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "core_notifications_side" CHECK("side" IN ('audience', 'members')),
	CONSTRAINT "core_notifications_recipient" CHECK(("account_id" IS NULL) <> ("address" IS NULL) OR "payload" IS NULL)
);
--> statement-breakpoint
CREATE TABLE `core_passkey_challenges` (
	`id` text PRIMARY KEY,
	`purpose` text NOT NULL,
	`challenge` text NOT NULL,
	`account_id` text,
	`session_id` text,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_passkeys` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`sign_count` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`authenticator` text,
	`synced` integer DEFAULT false NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_performance_access` (
	`performance_id` text NOT NULL,
	`term_id` text NOT NULL,
	`detail` text,
	CONSTRAINT `core_performance_access_pk` PRIMARY KEY(`performance_id`, `term_id`),
	CONSTRAINT `fk_core_performance_access_performance_id_core_performances_id_fk` FOREIGN KEY (`performance_id`) REFERENCES `core_performances`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_performance_access_term_id_core_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "core_performance_access_detail" CHECK("detail" IS NULL OR length("detail") <= 200)
);
--> statement-breakpoint
CREATE TABLE `core_performance_effect_exceptions` (
	`performance_id` text NOT NULL,
	`term_id` text NOT NULL,
	CONSTRAINT `core_performance_effect_exceptions_pk` PRIMARY KEY(`performance_id`, `term_id`),
	CONSTRAINT `fk_core_performance_effect_exceptions_performance_id_core_performances_id_fk` FOREIGN KEY (`performance_id`) REFERENCES `core_performances`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_performance_effect_exceptions_term_id_core_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `core_terms`(`id`)
);
--> statement-breakpoint
CREATE TABLE `core_performance_runs` (
	`id` text PRIMARY KEY,
	`production_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`space_id` text NOT NULL,
	`scheduled` integer NOT NULL,
	`capacity` integer,
	`interval_count` integer,
	`interval_minutes` integer,
	`label` text,
	`external_booking_url` text,
	`items` text NOT NULL,
	`total` integer NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'running' NOT NULL,
	`stop_reason` text,
	`pattern` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_core_performance_runs_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE CASCADE,
	CONSTRAINT "core_performance_runs_state" CHECK("state" IN ('running', 'stopped', 'done', 'removing', 'removed')),
	CONSTRAINT "core_performance_runs_done" CHECK("done" BETWEEN 0 AND "total"),
	CONSTRAINT "core_performance_runs_stop" CHECK("stop_reason" IS NULL OR length("stop_reason") <= 300)
);
--> statement-breakpoint
CREATE TABLE `core_performances` (
	`id` text PRIMARY KEY,
	`production_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`space_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`doors_at` integer,
	`ends_at` integer NOT NULL,
	`operating_day` text NOT NULL,
	`interval_count` integer,
	`interval_minutes` integer,
	`capacity` integer,
	`label` text,
	`external_booking_url` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`cancelled_at` integer,
	`cancel_reason_term_id` text,
	`cancel_note` text,
	`completed_at` integer,
	`run_id` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_core_performances_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_core_performances_venue_id_core_venues_id_fk` FOREIGN KEY (`venue_id`) REFERENCES `core_venues`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_core_performances_cancel_reason_term_id_core_terms_id_fk` FOREIGN KEY (`cancel_reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT `fk_core_performances_run_id_core_performance_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `core_performance_runs`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_core_performances_space_id_venue_id_core_spaces_id_venue_id_fk` FOREIGN KEY (`space_id`,`venue_id`) REFERENCES `core_spaces`(`id`,`venue_id`) ON DELETE RESTRICT,
	CONSTRAINT "core_performances_state" CHECK("state" IN ('draft', 'scheduled', 'cancelled', 'completed')),
	CONSTRAINT "core_performances_period" CHECK("ends_at" > "starts_at"),
	CONSTRAINT "core_performances_doors" CHECK("doors_at" IS NULL OR "doors_at" <= "starts_at"),
	CONSTRAINT "core_performances_interval" CHECK("interval_count" IS NULL OR "interval_count" >= 0),
	CONSTRAINT "core_performances_capacity" CHECK("capacity" IS NULL OR "capacity" >= 0),
	CONSTRAINT "core_performances_label" CHECK("label" IS NULL OR length("label") BETWEEN 1 AND 40),
	CONSTRAINT "core_performances_booking_url" CHECK("external_booking_url" IS NULL OR "external_booking_url" LIKE 'https://_%'),
	CONSTRAINT "core_performances_cancel" CHECK(("state" = 'cancelled') = ("cancelled_at" IS NOT NULL AND "cancel_reason_term_id" IS NOT NULL)),
	CONSTRAINT "core_performances_cancel_note" CHECK("cancel_note" IS NULL OR length("cancel_note") <= 200),
	CONSTRAINT "core_performances_completed" CHECK(("state" = 'completed') = ("completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `core_place_access` (
	`id` text PRIMARY KEY,
	`venue_id` text NOT NULL,
	`space_id` text,
	`term_id` text NOT NULL,
	`note` text,
	`sort` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_core_place_access_venue_id_core_venues_id_fk` FOREIGN KEY (`venue_id`) REFERENCES `core_venues`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_place_access_term_id_core_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT `fk_core_place_access_space_id_venue_id_core_spaces_id_venue_id_fk` FOREIGN KEY (`space_id`,`venue_id`) REFERENCES `core_spaces`(`id`,`venue_id`) ON DELETE CASCADE,
	CONSTRAINT "core_place_access_note" CHECK("note" IS NULL OR length("note") <= 200)
);
--> statement-breakpoint
CREATE TABLE `core_policy_versions` (
	`id` text PRIMARY KEY,
	`policy` text NOT NULL,
	`number` integer NOT NULL,
	`hash` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `core_production_advisories` (
	`production_id` text NOT NULL,
	`term_id` text NOT NULL,
	`level` text NOT NULL,
	`level_assumed` integer DEFAULT false NOT NULL,
	`detail` text,
	CONSTRAINT `core_production_advisories_pk` PRIMARY KEY(`production_id`, `term_id`),
	CONSTRAINT `fk_core_production_advisories_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_production_advisories_term_id_core_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "core_production_advisories_detail" CHECK("detail" IS NULL OR length("detail") <= 300),
	CONSTRAINT "core_production_advisories_level" CHECK("level" IN ('mentioned', 'discussed', 'depicted'))
);
--> statement-breakpoint
CREATE TABLE `core_production_credits` (
	`id` text PRIMARY KEY,
	`production_id` text NOT NULL,
	`account_id` text,
	`credited_name` text NOT NULL,
	`role` text NOT NULL,
	`section_term_id` text NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_core_production_credits_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_production_credits_section_term_id_core_terms_id_fk` FOREIGN KEY (`section_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "core_production_credits_visibility" CHECK("visibility" IN ('public', 'members', 'hidden')),
	CONSTRAINT "core_production_credits_name" CHECK(length("credited_name") BETWEEN 1 AND 120),
	CONSTRAINT "core_production_credits_role" CHECK(length("role") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE TABLE `core_production_effects` (
	`production_id` text NOT NULL,
	`term_id` text NOT NULL,
	`detail` text,
	CONSTRAINT `core_production_effects_pk` PRIMARY KEY(`production_id`, `term_id`),
	CONSTRAINT `fk_core_production_effects_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_production_effects_term_id_core_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "core_production_effects_detail" CHECK("detail" IS NULL OR length("detail") <= 300)
);
--> statement-breakpoint
CREATE TABLE `core_production_slugs` (
	`slug` text PRIMARY KEY,
	`production_id` text NOT NULL,
	`retired_at` integer NOT NULL,
	CONSTRAINT `fk_core_production_slugs_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `core_productions` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`summary` text,
	`description` text,
	`kind` text NOT NULL,
	`category_term_id` text,
	`season_id` text,
	`company_name` text,
	`age_min` integer,
	`age_restricted` integer DEFAULT false NOT NULL,
	`effects_confirmed_none` integer DEFAULT false NOT NULL,
	`advisories_confirmed_none` integer DEFAULT false NOT NULL,
	`content_note` text,
	`running_minutes` integer,
	`interval_count` integer DEFAULT 0 NOT NULL,
	`interval_minutes` integer,
	`doors_before_minutes` integer,
	`capacity` integer,
	`usual_space_id` text,
	`external_booking_url` text,
	`latecomers` text,
	`credits_public` integer NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`cancel_reason_term_id` text,
	`listed` integer DEFAULT true NOT NULL,
	`published_at` integer,
	`first_starts_at` integer,
	`last_ends_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_core_productions_category_term_id_core_terms_id_fk` FOREIGN KEY (`category_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT `fk_core_productions_season_id_core_seasons_id_fk` FOREIGN KEY (`season_id`) REFERENCES `core_seasons`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_core_productions_usual_space_id_core_spaces_id_fk` FOREIGN KEY (`usual_space_id`) REFERENCES `core_spaces`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_core_productions_cancel_reason_term_id_core_terms_id_fk` FOREIGN KEY (`cancel_reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "core_productions_state" CHECK("state" IN ('draft', 'published', 'withdrawn', 'cancelled')),
	CONSTRAINT "core_productions_kind" CHECK("kind" IN ('own', 'visiting', 'hire', 'event')),
	CONSTRAINT "core_productions_title" CHECK(length("title") BETWEEN 1 AND 200),
	CONSTRAINT "core_productions_summary" CHECK("summary" IS NULL OR length("summary") <= 300),
	CONSTRAINT "core_productions_age_min" CHECK("age_min" IS NULL OR "age_min" BETWEEN 0 AND 21),
	CONSTRAINT "core_productions_age_restricted" CHECK("age_restricted" = 0 OR "age_min" IS NOT NULL),
	CONSTRAINT "core_productions_running" CHECK("running_minutes" IS NULL OR "running_minutes" > 0),
	CONSTRAINT "core_productions_intervals" CHECK("interval_count" >= 0),
	CONSTRAINT "core_productions_booking_url" CHECK("external_booking_url" IS NULL OR "external_booking_url" LIKE 'https://_%'),
	CONSTRAINT "core_productions_cancel_reason" CHECK(("state" = 'cancelled') = ("cancel_reason_term_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `core_recovery_codes` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`code_sealed` text,
	`position` integer,
	`created_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_role_abilities` (
	`role_id` text NOT NULL,
	`ability` text NOT NULL,
	CONSTRAINT `core_role_abilities_pk` PRIMARY KEY(`role_id`, `ability`),
	CONSTRAINT `fk_core_role_abilities_role_id_core_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `core_roles`(`id`)
);
--> statement-breakpoint
CREATE TABLE `core_roles` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`fixed` integer DEFAULT false NOT NULL,
	`opens_members_area` integer DEFAULT false NOT NULL,
	`needs_managed_identity` integer DEFAULT false NOT NULL,
	`expiry_rule` text NOT NULL,
	`expiry_days` integer,
	`preset` text,
	`created_at` integer NOT NULL,
	`archived_at` integer,
	CONSTRAINT "core_roles_expiry_days" CHECK((expiry_rule = 'days') = (expiry_days IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `core_run_presets` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`slots` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "core_run_presets_name_length" CHECK(length("name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE `core_seasons` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`summary` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "core_seasons_state" CHECK("state" IN ('draft', 'published', 'archived')),
	CONSTRAINT "core_seasons_dates" CHECK("ends_on" >= "starts_on")
);
--> statement-breakpoint
CREATE TABLE `core_sender_identities` (
	`key` text PRIMARY KEY,
	`display_name` text NOT NULL,
	`local_part` text NOT NULL,
	`reply_to` text,
	`state` text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `core_sessions` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`methods` text NOT NULL,
	`assurance` text NOT NULL,
	`reasserted_at` integer,
	`device` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ended_at` integer,
	`ended_reason` text
);
--> statement-breakpoint
CREATE TABLE `core_setting_changes` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`reason` text,
	`at` integer NOT NULL,
	`actor` text
);
--> statement-breakpoint
CREATE TABLE `core_settings` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `core_signing_keys` (
	`id` text PRIMARY KEY,
	`purpose` text NOT NULL,
	`public_key` text NOT NULL,
	`private_key` text,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`checking_from` integer,
	`retired_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_spaces` (
	`id` text PRIMARY KEY,
	`venue_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kind_term_id` text NOT NULL,
	`default_capacity` integer,
	`performable` integer DEFAULT true NOT NULL,
	`exclusive` integer DEFAULT true NOT NULL,
	`description` text,
	`access_info` text,
	`managed` integer DEFAULT true NOT NULL,
	`finding_it` text,
	`doors_before_minutes` integer,
	`run_preset_id` text,
	`state` text DEFAULT 'active' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_core_spaces_venue_id_core_venues_id_fk` FOREIGN KEY (`venue_id`) REFERENCES `core_venues`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_core_spaces_kind_term_id_core_terms_id_fk` FOREIGN KEY (`kind_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "core_spaces_state" CHECK("state" IN ('active', 'archived')),
	CONSTRAINT "core_spaces_capacity" CHECK("default_capacity" IS NULL OR "default_capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE `core_task_runs` (
	`task` text NOT NULL,
	`due_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`outcome` text,
	`job_id` text,
	CONSTRAINT `core_task_runs_pk` PRIMARY KEY(`task`, `due_at`)
);
--> statement-breakpoint
CREATE TABLE `core_term_groups` (
	`id` text PRIMARY KEY,
	`vocabulary_key` text NOT NULL,
	`label` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_core_term_groups_vocabulary_key_core_vocabularies_key_fk` FOREIGN KEY (`vocabulary_key`) REFERENCES `core_vocabularies`(`key`) ON DELETE RESTRICT,
	CONSTRAINT "core_term_groups_label_length" CHECK(length("label") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE `core_terms` (
	`id` text PRIMARY KEY,
	`vocabulary_key` text NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`icon` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`seeded` integer DEFAULT false NOT NULL,
	`retired_at` integer,
	`merged_into_id` text,
	`group_id` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_core_terms_vocabulary_key_core_vocabularies_key_fk` FOREIGN KEY (`vocabulary_key`) REFERENCES `core_vocabularies`(`key`) ON DELETE RESTRICT,
	CONSTRAINT `fk_core_terms_merged_into_id_core_terms_id_fk` FOREIGN KEY (`merged_into_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT `fk_core_terms_group_id_core_term_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `core_term_groups`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "core_terms_label_length" CHECK(length("label") BETWEEN 1 AND 80),
	CONSTRAINT "core_terms_description_length" CHECK("description" IS NULL OR length("description") <= 300)
);
--> statement-breakpoint
CREATE TABLE `core_venues` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`address_lines` text,
	`locality` text,
	`postcode` text,
	`country` text,
	`latitude` real,
	`longitude` real,
	`description` text,
	`access_info` text,
	`getting_here` text,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "core_venues_state" CHECK("state" IN ('active', 'archived')),
	CONSTRAINT "core_venues_position" CHECK(("latitude" IS NULL) = ("longitude" IS NULL)),
	CONSTRAINT "core_venues_country" CHECK("country" IS NULL OR length("country") = 2)
);
--> statement-breakpoint
CREATE TABLE `core_vocabularies` (
	`key` text PRIMARY KEY,
	`owner` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`ordering` text DEFAULT 'manual' NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`term_class` text DEFAULT 'public' NOT NULL,
	`grouped` integer DEFAULT false NOT NULL,
	CONSTRAINT "core_vocabularies_ordering" CHECK("ordering" IN ('manual', 'alphabetical')),
	CONSTRAINT "core_vocabularies_term_class" CHECK("term_class" IN ('public', 'internal'))
);
--> statement-breakpoint
CREATE TABLE `core_webhook_deliveries` (
	`id` text PRIMARY KEY,
	`webhook_id` text NOT NULL,
	`event_id` text NOT NULL,
	`event_name` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`response_status` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	CONSTRAINT `fk_core_webhook_deliveries_webhook_id_core_webhooks_id_fk` FOREIGN KEY (`webhook_id`) REFERENCES `core_webhooks`(`id`) ON DELETE CASCADE,
	CONSTRAINT "core_webhook_deliveries_state" CHECK("state" IN ('queued', 'sending', 'sent', 'retrying', 'failed'))
);
--> statement-breakpoint
CREATE TABLE `core_webhooks` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`format` text NOT NULL,
	`url` text NOT NULL,
	`url_hint` text NOT NULL,
	`secret` text,
	`events` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_success_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "core_webhooks_name_length" CHECK(length("name") BETWEEN 1 AND 60),
	CONSTRAINT "core_webhooks_format" CHECK("format" IN ('json', 'discord', 'slack')),
	CONSTRAINT "core_webhooks_secret" CHECK("format" <> 'json' OR "secret" IS NOT NULL),
	CONSTRAINT "core_webhooks_state" CHECK("state" IN ('active', 'paused', 'failing'))
);
--> statement-breakpoint
CREATE TABLE `finance_accounts` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`module` text NOT NULL,
	`system_key` text,
	`scope` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "finance_accounts_kind" CHECK("kind" IN ('asset', 'liability', 'income', 'expense', 'equity'))
);
--> statement-breakpoint
CREATE TABLE `finance_entries` (
	`id` text PRIMARY KEY,
	`posting_id` text NOT NULL,
	`account_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`for_module` text,
	`production_id` text,
	`performance_id` text,
	`tax_code` text DEFAULT 'none' NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_finance_entries_posting_id_finance_postings_id_fk` FOREIGN KEY (`posting_id`) REFERENCES `finance_postings`(`id`),
	CONSTRAINT `fk_finance_entries_account_id_finance_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`),
	CONSTRAINT "finance_entries_amount" CHECK("amount_minor" <> 0),
	CONSTRAINT "finance_entries_tax" CHECK("tax_code" <> 'none' OR "tax_minor" = 0)
);
--> statement-breakpoint
CREATE TABLE `finance_period_closes` (
	`id` text PRIMARY KEY,
	`period_id` text NOT NULL,
	`action` text NOT NULL,
	`by` text,
	`at` integer NOT NULL,
	`debits_minor` integer NOT NULL,
	`credits_minor` integer NOT NULL,
	`reason_term_id` text,
	CONSTRAINT `fk_finance_period_closes_period_id_finance_periods_id_fk` FOREIGN KEY (`period_id`) REFERENCES `finance_periods`(`id`),
	CONSTRAINT `fk_finance_period_closes_reason_term_id_core_terms_id_fk` FOREIGN KEY (`reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "finance_period_closes_action" CHECK("action" IN ('close', 'reopen')),
	CONSTRAINT "finance_period_closes_reason" CHECK("action" = 'close' OR "reason_term_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `finance_periods` (
	`id` text PRIMARY KEY,
	`label` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "finance_periods_order" CHECK("ends_on" >= "starts_on")
);
--> statement-breakpoint
CREATE TABLE `finance_postings` (
	`id` text PRIMARY KEY,
	`idempotency_key` text NOT NULL,
	`source_module` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`kind` text NOT NULL,
	`reverses_id` text,
	`period_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`posted_at` integer NOT NULL,
	`posted_by` text,
	CONSTRAINT `fk_finance_postings_period_id_finance_periods_id_fk` FOREIGN KEY (`period_id`) REFERENCES `finance_periods`(`id`),
	CONSTRAINT "finance_postings_kind" CHECK("kind" IN ('sale', 'refund', 'fee', 'payout', 'recognition', 'transfer', 'cash_variance', 'unfulfilled', 'correction', 'opening'))
);
--> statement-breakpoint
CREATE TABLE `finance_seals` (
	`posting_id` text NOT NULL,
	`entry_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_finance_seals_posting_id_finance_postings_id_fk` FOREIGN KEY (`posting_id`) REFERENCES `finance_postings`(`id`),
	CONSTRAINT "finance_seals_entry_count" CHECK("entry_count" >= 2)
);
--> statement-breakpoint
CREATE TABLE `finance_tax_codes` (
	`code` text PRIMARY KEY,
	`label` text NOT NULL,
	`rate_basis_points` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	CONSTRAINT "finance_tax_codes_rate" CHECK("rate_basis_points" >= 0)
);
--> statement-breakpoint
CREATE TABLE `forms_action_runs` (
	`id` text PRIMARY KEY,
	`response_id` text NOT NULL,
	`form_id` text NOT NULL,
	`move_key` text NOT NULL,
	`use_id` text NOT NULL,
	`action_key` text NOT NULL,
	`map` text NOT NULL,
	`revision` integer NOT NULL,
	`actor_id` text,
	`state` text DEFAULT 'waiting' NOT NULL,
	`detail` text,
	`record_type` text,
	`record_id` text,
	`job_id` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	CONSTRAINT `fk_forms_action_runs_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`),
	CONSTRAINT `fk_forms_action_runs_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`),
	CONSTRAINT "forms_action_runs_state" CHECK("state" IN ('waiting', 'done', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE `forms_answers` (
	`response_id` text NOT NULL,
	`revision` integer NOT NULL,
	`question_id` text NOT NULL,
	`repeat_index` integer DEFAULT 0 NOT NULL,
	`data_class` text NOT NULL,
	`value_text` text,
	`value_number` real,
	`value_json` text,
	`other_text` text,
	`value_cipher` text,
	`label_snapshot` text,
	CONSTRAINT `forms_answers_pk` PRIMARY KEY(`response_id`, `revision`, `question_id`, `repeat_index`),
	CONSTRAINT `fk_forms_answers_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`),
	CONSTRAINT "forms_answers_class" CHECK("data_class" IN ('public', 'internal', 'personal', 'free-text', 'special'))
);
--> statement-breakpoint
CREATE TABLE `forms_drafts` (
	`form_id` text PRIMARY KEY NOT NULL,
	`definition` text NOT NULL,
	`format` integer NOT NULL,
	`edit_revision` integer DEFAULT 0 NOT NULL,
	`edited_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_forms_drafts_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`)
);
--> statement-breakpoint
CREATE TABLE `forms_fields` (
	`form_id` text NOT NULL,
	`question_id` text NOT NULL,
	`key` text NOT NULL,
	`type` text NOT NULL,
	`data_class` text NOT NULL,
	`label` text NOT NULL,
	`first_version` integer NOT NULL,
	`retired_in_version` integer,
	CONSTRAINT `forms_fields_pk` PRIMARY KEY(`form_id`, `question_id`),
	CONSTRAINT `fk_forms_fields_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`),
	CONSTRAINT "forms_fields_class" CHECK("data_class" IN ('public', 'internal', 'personal', 'free-text', 'special'))
);
--> statement-breakpoint
CREATE TABLE `forms_forms` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`mode` text DEFAULT 'submission' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`live_version_id` text,
	`anonymous` integer DEFAULT false NOT NULL,
	`retention_days` integer,
	`retention_declined_days` integer,
	`allow_edits` integer DEFAULT false NOT NULL,
	`template_key` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`archived_at` integer,
	CONSTRAINT `fk_forms_forms_live_version_id_forms_versions_id_fk` FOREIGN KEY (`live_version_id`) REFERENCES `forms_versions`(`id`),
	CONSTRAINT "forms_forms_mode" CHECK("mode" IN ('submission', 'record')),
	CONSTRAINT "forms_forms_status" CHECK("status" IN ('draft', 'live', 'paused', 'closed', 'archived'))
);
--> statement-breakpoint
CREATE TABLE `forms_old_addresses` (
	`slug` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_forms_old_addresses_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`)
);
--> statement-breakpoint
CREATE TABLE `forms_placements` (
	`id` text PRIMARY KEY,
	`form_id` text NOT NULL,
	`slot_key` text NOT NULL,
	`subject_type` text,
	`subject_id` text,
	`audience` text DEFAULT 'anyone' NOT NULL,
	`audience_role` text,
	`opens_at` integer,
	`closes_at` integer,
	`response_cap` integer,
	`response_count` integer DEFAULT 0 NOT NULL,
	`one_per_person` integer DEFAULT false NOT NULL,
	`edit_after_submit` text DEFAULT 'never' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_forms_placements_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`),
	CONSTRAINT "forms_placements_audience" CHECK("audience" IN ('anyone', 'signed_in', 'members', 'role', 'invited')),
	CONSTRAINT "forms_placements_edit" CHECK("edit_after_submit" IN ('never', 'until_close', 'when_returned')),
	CONSTRAINT "forms_placements_status" CHECK("status" IN ('active', 'paused', 'ended')),
	CONSTRAINT "forms_placements_cap" CHECK("response_cap" IS NULL OR "response_count" <= "response_cap"),
	CONSTRAINT "forms_placements_count" CHECK("response_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `forms_response_drafts` (
	`response_id` text PRIMARY KEY NOT NULL,
	`answers_cipher` text,
	`page_id` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_forms_response_drafts_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`)
);
--> statement-breakpoint
CREATE TABLE `forms_responses` (
	`id` text PRIMARY KEY,
	`reference` text NOT NULL,
	`form_id` text NOT NULL,
	`version_id` text NOT NULL,
	`placement_id` text NOT NULL,
	`subject_type` text,
	`subject_id` text,
	`realm` text NOT NULL,
	`person_id` text,
	`respondent_email` text,
	`entered_by` text,
	`state` text NOT NULL,
	`stage_key` text,
	`stage_kind` text,
	`current_revision` integer DEFAULT 0 NOT NULL,
	`stage_note` text,
	`decision_reason` text,
	`unique_key` text,
	`calculated` text,
	`is_test` integer DEFAULT false NOT NULL,
	`submitted_at` integer,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`retention_due_at` integer,
	`anonymised_at` integer,
	`reminded_waiting_at` integer,
	`reminded_closing_at` integer,
	`change_token_hash` text,
	`change_token_expires_at` integer,
	CONSTRAINT `fk_forms_responses_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`),
	CONSTRAINT `fk_forms_responses_version_id_forms_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `forms_versions`(`id`),
	CONSTRAINT `fk_forms_responses_placement_id_forms_placements_id_fk` FOREIGN KEY (`placement_id`) REFERENCES `forms_placements`(`id`),
	CONSTRAINT "forms_responses_state" CHECK("state" IN ('draft', 'awaiting_payment', 'submitted', 'withdrawn')),
	CONSTRAINT "forms_responses_stage" CHECK("stage_kind" IS NULL OR "stage_kind" IN ('pending', 'in_review', 'returned', 'approved', 'declined', 'closed')),
	CONSTRAINT "forms_responses_realm" CHECK("realm" IN ('audience', 'members'))
);
--> statement-breakpoint
CREATE TABLE `forms_review_assignments` (
	`id` text PRIMARY KEY,
	`round_id` text NOT NULL,
	`response_id` text NOT NULL,
	`form_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`status` text DEFAULT 'assigned' NOT NULL,
	`conflict` text,
	`vote` text,
	`scores` text,
	`comment` text,
	`submitted_at` integer,
	`created_at` integer NOT NULL,
	`reminded_at` integer,
	CONSTRAINT `fk_forms_review_assignments_round_id_forms_review_rounds_id_fk` FOREIGN KEY (`round_id`) REFERENCES `forms_review_rounds`(`id`),
	CONSTRAINT `fk_forms_review_assignments_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`),
	CONSTRAINT `fk_forms_review_assignments_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`),
	CONSTRAINT "forms_review_assignments_status" CHECK("status" IN ('assigned', 'submitted', 'conflicted')),
	CONSTRAINT "forms_review_assignments_conflict" CHECK("conflict" IS NULL OR "conflict" IN ('declared', 'automatic')),
	CONSTRAINT "forms_review_assignments_vote" CHECK("vote" IS NULL OR "vote" IN ('for', 'against', 'abstain'))
);
--> statement-breakpoint
CREATE TABLE `forms_review_rounds` (
	`id` text PRIMARY KEY,
	`response_id` text NOT NULL,
	`form_id` text NOT NULL,
	`stage_key` text NOT NULL,
	`revision` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`released_at` integer,
	`released_by` text,
	`closed_at` integer,
	CONSTRAINT `fk_forms_review_rounds_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`),
	CONSTRAINT `fk_forms_review_rounds_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`)
);
--> statement-breakpoint
CREATE TABLE `forms_stage_history` (
	`id` text PRIMARY KEY,
	`response_id` text NOT NULL,
	`from_stage` text,
	`to_stage` text NOT NULL,
	`to_kind` text NOT NULL,
	`transition_key` text NOT NULL,
	`revision` integer NOT NULL,
	`actor_id` text,
	`at` integer NOT NULL,
	CONSTRAINT `fk_forms_stage_history_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`),
	CONSTRAINT "forms_stage_history_kind" CHECK("to_kind" IN ('pending', 'in_review', 'returned', 'approved', 'declined', 'closed'))
);
--> statement-breakpoint
CREATE TABLE `forms_stage_notes` (
	`id` text PRIMARY KEY,
	`response_id` text NOT NULL,
	`at` integer NOT NULL,
	`note` text,
	CONSTRAINT `fk_forms_stage_notes_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`)
);
--> statement-breakpoint
CREATE TABLE `forms_templates` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`definition` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `forms_versions` (
	`id` text PRIMARY KEY,
	`form_id` text NOT NULL,
	`number` integer NOT NULL,
	`definition` text NOT NULL,
	`definition_hash` text NOT NULL,
	`format` integer NOT NULL,
	`change_summary` text NOT NULL,
	`published_by` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_forms_versions_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_assignments` (
	`id` text PRIMARY KEY,
	`shift_id` text NOT NULL,
	`account_id` text NOT NULL,
	`state` text NOT NULL,
	`source` text NOT NULL,
	`assigned_by` text,
	`confirmed_at` integer,
	`checked_in_at` integer,
	`checked_out_at` integer,
	`ended_at` integer,
	`ended_by` text,
	`release_reason` text,
	`minutes_worked` integer,
	`reminded` integer DEFAULT 0 NOT NULL,
	`moved_at` integer,
	`freed_by_merge` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_assignments_shift_id_front_of_house_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `front_of_house_shifts`(`id`),
	CONSTRAINT "front_of_house_assignments_state" CHECK("state" IN ('requested', 'confirmed', 'release_requested', 'checked_in', 'worked', 'no_show', 'declined', 'withdrawn', 'released', 'removed')),
	CONSTRAINT "front_of_house_assignments_source" CHECK("source" IN ('sign-up', 'assigned', 'cover')),
	CONSTRAINT "front_of_house_assignments_reason" CHECK("release_reason" IS NULL OR length("release_reason") <= 300),
	CONSTRAINT "front_of_house_assignments_minutes" CHECK("minutes_worked" IS NULL OR "minutes_worked" >= 0)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_calendar_feeds` (
	`account_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`generation` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `front_of_house_checklist_entries` (
	`id` text PRIMARY KEY,
	`run_id` text NOT NULL,
	`item_id` text NOT NULL,
	`label` text NOT NULL,
	`outcome` text NOT NULL,
	`reading` integer,
	`reason_code` text,
	`reason_note` text,
	`done_by` text NOT NULL,
	`done_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_checklist_entries_run_id_front_of_house_checklist_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `front_of_house_checklist_runs`(`id`),
	CONSTRAINT `fk_front_of_house_checklist_entries_item_id_front_of_house_checklist_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `front_of_house_checklist_items`(`id`),
	CONSTRAINT `fk_front_of_house_checklist_entries_reason_code_core_terms_id_fk` FOREIGN KEY (`reason_code`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "front_of_house_checklist_entries_outcome" CHECK("outcome" IN ('done', 'exception', 'not_applicable')),
	CONSTRAINT "front_of_house_checklist_entries_reason" CHECK("outcome" <> 'exception' OR "reason_code" IS NOT NULL),
	CONSTRAINT "front_of_house_checklist_entries_note" CHECK("reason_note" IS NULL OR length("reason_note") <= 200)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_checklist_items` (
	`id` text PRIMARY KEY,
	`checklist_id` text NOT NULL,
	`label` text NOT NULL,
	`help` text,
	`kind` text DEFAULT 'tick' NOT NULL,
	`unit` text,
	`required` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_checklist_items_checklist_id_front_of_house_checklists_id_fk` FOREIGN KEY (`checklist_id`) REFERENCES `front_of_house_checklists`(`id`),
	CONSTRAINT "front_of_house_checklist_items_label" CHECK(length("label") BETWEEN 1 AND 160),
	CONSTRAINT "front_of_house_checklist_items_help" CHECK("help" IS NULL OR length("help") <= 500),
	CONSTRAINT "front_of_house_checklist_items_kind" CHECK("kind" IN ('tick', 'reading')),
	CONSTRAINT "front_of_house_checklist_items_unit" CHECK("unit" IS NULL OR ("kind" = 'reading' AND length("unit") <= 20))
);
--> statement-breakpoint
CREATE TABLE `front_of_house_checklist_runs` (
	`id` text PRIMARY KEY,
	`checklist_id` text NOT NULL,
	`performance_id` text,
	`venue_id` text,
	`local_date` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`completed_by` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_checklist_runs_checklist_id_front_of_house_checklists_id_fk` FOREIGN KEY (`checklist_id`) REFERENCES `front_of_house_checklists`(`id`),
	CONSTRAINT "front_of_house_checklist_runs_state" CHECK("state" IN ('open', 'complete', 'complete_with_exceptions'))
);
--> statement-breakpoint
CREATE TABLE `front_of_house_checklists` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`moment` text NOT NULL,
	`venue_id` text,
	`duty_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_checklists_duty_id_front_of_house_duties_id_fk` FOREIGN KEY (`duty_id`) REFERENCES `front_of_house_duties`(`id`),
	CONSTRAINT "front_of_house_checklists_name" CHECK(length("name") BETWEEN 1 AND 80),
	CONSTRAINT "front_of_house_checklists_moment" CHECK("moment" IN ('pre-show', 'post-show', 'other'))
);
--> statement-breakpoint
CREATE TABLE `front_of_house_duties` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`is_lead` integer DEFAULT false NOT NULL,
	`call_before_minutes` integer NOT NULL,
	`stay_after_minutes` integer NOT NULL,
	`requirements` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "front_of_house_duties_name_length" CHECK(length("name") BETWEEN 1 AND 60),
	CONSTRAINT "front_of_house_duties_description" CHECK("description" IS NULL OR length("description") <= 500),
	CONSTRAINT "front_of_house_duties_call" CHECK("call_before_minutes" BETWEEN 0 AND 480),
	CONSTRAINT "front_of_house_duties_stay" CHECK("stay_after_minutes" BETWEEN 0 AND 480)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_emergency_cards` (
	`id` text PRIMARY KEY,
	`venue_id` text NOT NULL,
	`body` text NOT NULL,
	`reviewed_on` text NOT NULL,
	`reviewed_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "front_of_house_emergency_cards_body" CHECK(length("body") BETWEEN 1 AND 8000)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_incident_actions` (
	`id` text PRIMARY KEY,
	`incident_id` text NOT NULL,
	`what` text NOT NULL,
	`owner_id` text,
	`due_on` text,
	`state` text DEFAULT 'open' NOT NULL,
	`resolved_at` integer,
	`resolved_note` text,
	`chased_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_incident_actions_incident_id_front_of_house_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `front_of_house_incidents`(`id`),
	CONSTRAINT "front_of_house_incident_actions_what" CHECK(length("what") BETWEEN 1 AND 300),
	CONSTRAINT "front_of_house_incident_actions_state" CHECK("state" IN ('open', 'done', 'dropped')),
	CONSTRAINT "front_of_house_incident_actions_note" CHECK("resolved_note" IS NULL OR length("resolved_note") <= 300),
	CONSTRAINT "front_of_house_incident_actions_dropped" CHECK("state" <> 'dropped' OR "resolved_note" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_incident_people` (
	`id` text PRIMARY KEY,
	`incident_id` text NOT NULL,
	`account_id` text,
	`name` text,
	`contact` text,
	`involvement` text NOT NULL,
	`is_child` integer DEFAULT false NOT NULL,
	`from_report` integer DEFAULT false NOT NULL,
	`details` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_incident_people_incident_id_front_of_house_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `front_of_house_incidents`(`id`),
	CONSTRAINT "front_of_house_incident_people_who" CHECK("account_id" IS NOT NULL OR "name" IS NOT NULL),
	CONSTRAINT "front_of_house_incident_people_name" CHECK("name" IS NULL OR length("name") <= 120),
	CONSTRAINT "front_of_house_incident_people_contact" CHECK("contact" IS NULL OR length("contact") <= 200),
	CONSTRAINT "front_of_house_incident_people_involvement" CHECK("involvement" IN ('affected', 'witness', 'helped', 'other'))
);
--> statement-breakpoint
CREATE TABLE `front_of_house_incident_updates` (
	`id` text PRIMARY KEY,
	`incident_id` text NOT NULL,
	`kind` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`body` text,
	`author_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_incident_updates_incident_id_front_of_house_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `front_of_house_incidents`(`id`),
	CONSTRAINT "front_of_house_incident_updates_kind" CHECK("kind" IN ('comment', 'state', 'severity', 'category')),
	CONSTRAINT "front_of_house_incident_updates_body" CHECK("body" IS NULL OR length("body") <= 2000)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_incidents` (
	`id` text PRIMARY KEY,
	`number` integer NOT NULL,
	`year` integer NOT NULL,
	`kind` text NOT NULL,
	`category_id` text,
	`severity` text DEFAULT 'minor' NOT NULL,
	`state` text DEFAULT 'reported' NOT NULL,
	`performance_id` text,
	`venue_id` text,
	`space_id` text,
	`where_note` text,
	`occurred_at` integer NOT NULL,
	`what_happened` text NOT NULL,
	`immediate_action` text,
	`first_aid_given` integer DEFAULT false NOT NULL,
	`emergency_services_called` integer DEFAULT false NOT NULL,
	`reported_by` text NOT NULL,
	`reported_at` integer NOT NULL,
	`reviewer_id` text,
	`closed_by` text,
	`closed_at` integer,
	`closing_note` text,
	`digested_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_incidents_category_id_core_terms_id_fk` FOREIGN KEY (`category_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "front_of_house_incidents_kind" CHECK("kind" IN ('incident', 'near_miss')),
	CONSTRAINT "front_of_house_incidents_severity" CHECK("severity" IN ('minor', 'moderate', 'serious')),
	CONSTRAINT "front_of_house_incidents_state" CHECK("state" IN ('reported', 'in_review', 'closed')),
	CONSTRAINT "front_of_house_incidents_floor" CHECK("severity" <> 'minor' OR ("first_aid_given" = 0 AND "emergency_services_called" = 0)),
	CONSTRAINT "front_of_house_incidents_where" CHECK("where_note" IS NULL OR length("where_note") <= 120),
	CONSTRAINT "front_of_house_incidents_what" CHECK(length("what_happened") BETWEEN 1 AND 4000),
	CONSTRAINT "front_of_house_incidents_action" CHECK("immediate_action" IS NULL OR length("immediate_action") <= 2000),
	CONSTRAINT "front_of_house_incidents_closing" CHECK("closing_note" IS NULL OR length("closing_note") <= 2000),
	CONSTRAINT "front_of_house_incidents_closed" CHECK("state" <> 'closed' OR ("closed_at" IS NOT NULL AND "closing_note" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `front_of_house_night_report_notes` (
	`id` text PRIMARY KEY,
	`report_id` text NOT NULL,
	`kind` text NOT NULL,
	`topic` text NOT NULL,
	`body` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_night_report_notes_report_id_front_of_house_night_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `front_of_house_night_reports`(`id`),
	CONSTRAINT "front_of_house_night_report_notes_kind" CHECK("kind" IN ('note', 'addendum')),
	CONSTRAINT "front_of_house_night_report_notes_topic" CHECK("topic" IN ('audience', 'building', 'show', 'staffing', 'other')),
	CONSTRAINT "front_of_house_night_report_notes_body" CHECK(length("body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_night_reports` (
	`id` text PRIMARY KEY,
	`performance_id` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`snapshot` text,
	`snapshot_version` integer DEFAULT 1 NOT NULL,
	`signed_off_by` text,
	`signed_off_at` integer,
	`distributed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "front_of_house_night_reports_state" CHECK("state" IN ('draft', 'signed_off')),
	CONSTRAINT "front_of_house_night_reports_signed" CHECK("state" = 'draft' OR ("snapshot" IS NOT NULL AND "signed_off_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `front_of_house_rota_template_lines` (
	`template_id` text NOT NULL,
	`duty_id` text NOT NULL,
	`places` integer NOT NULL,
	CONSTRAINT `front_of_house_rota_template_lines_pk` PRIMARY KEY(`template_id`, `duty_id`),
	CONSTRAINT `fk_front_of_house_rota_template_lines_template_id_front_of_house_rota_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `front_of_house_rota_templates`(`id`),
	CONSTRAINT `fk_front_of_house_rota_template_lines_duty_id_front_of_house_duties_id_fk` FOREIGN KEY (`duty_id`) REFERENCES `front_of_house_duties`(`id`),
	CONSTRAINT "front_of_house_rota_template_lines_places" CHECK("places" BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_rota_templates` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`venue_id` text,
	`is_default` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "front_of_house_rota_templates_name_length" CHECK(length("name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_shifts` (
	`id` text PRIMARY KEY,
	`performance_id` text,
	`venue_id` text,
	`title` text,
	`duty_id` text NOT NULL,
	`places` integer NOT NULL,
	`places_taken` integer DEFAULT 0 NOT NULL,
	`call_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`window_opens_at` integer NOT NULL,
	`window_closes_at` integer NOT NULL,
	`sign_up_closes_at` integer,
	`briefing` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`cancelled_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_shifts_duty_id_front_of_house_duties_id_fk` FOREIGN KEY (`duty_id`) REFERENCES `front_of_house_duties`(`id`),
	CONSTRAINT "front_of_house_shifts_title" CHECK(("performance_id" IS NOT NULL OR "title" IS NOT NULL) AND ("title" IS NULL OR length("title") <= 80)),
	CONSTRAINT "front_of_house_shifts_places" CHECK("places" BETWEEN 1 AND 50 AND "places_taken" BETWEEN 0 AND "places"),
	CONSTRAINT "front_of_house_shifts_times" CHECK("ends_at" > "call_at" AND "window_opens_at" <= "call_at" AND "window_closes_at" >= "ends_at"),
	CONSTRAINT "front_of_house_shifts_briefing" CHECK("briefing" IS NULL OR length("briefing") <= 1000),
	CONSTRAINT "front_of_house_shifts_state" CHECK("state" IN ('draft', 'published', 'completed', 'cancelled')),
	CONSTRAINT "front_of_house_shifts_reason" CHECK("cancelled_reason" IS NULL OR length("cancelled_reason") <= 200)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_timings` (
	`id` text PRIMARY KEY,
	`performance_id` text NOT NULL,
	`kind` text NOT NULL,
	`at` integer NOT NULL,
	`recorded_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "front_of_house_timings_kind_check" CHECK("kind" IN ('house_open', 'curtain_up', 'interval_start', 'interval_end', 'curtain_down', 'house_clear'))
);
--> statement-breakpoint
CREATE TABLE `membership_fees_charges` (
	`id` text PRIMARY KEY,
	`membership_id` text NOT NULL,
	`price_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`tax_code` text NOT NULL,
	`state` text NOT NULL,
	`intent_id` text,
	`channel` text,
	`refunded_minor` integer DEFAULT 0 NOT NULL,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_membership_fees_charges_membership_id_membership_memberships_id_fk` FOREIGN KEY (`membership_id`) REFERENCES `membership_memberships`(`id`),
	CONSTRAINT `fk_membership_fees_charges_price_id_membership_fees_prices_id_fk` FOREIGN KEY (`price_id`) REFERENCES `membership_fees_prices`(`id`),
	CONSTRAINT `fk_membership_fees_charges_intent_id_payments_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `payments_intents`(`id`),
	CONSTRAINT "membership_fees_charges_amount" CHECK("amount_minor" >= 1),
	CONSTRAINT "membership_fees_charges_state" CHECK("state" IN ('open', 'paid', 'void', 'refunded', 'part-refunded')),
	CONSTRAINT "membership_fees_charges_refunded" CHECK("refunded_minor" >= 0 AND "refunded_minor" <= "amount_minor"),
	CONSTRAINT "membership_fees_charges_paid" CHECK("state" <> 'paid' OR ("intent_id" IS NOT NULL AND "paid_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `membership_fees_prices` (
	`id` text PRIMARY KEY,
	`scheme_id` text NOT NULL,
	`length_option_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`tax_code` text DEFAULT 'none' NOT NULL,
	`applies_to` text NOT NULL,
	`from_date` text NOT NULL,
	`set_by` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_membership_fees_prices_scheme_id_membership_schemes_id_fk` FOREIGN KEY (`scheme_id`) REFERENCES `membership_schemes`(`id`),
	CONSTRAINT `fk_membership_fees_prices_length_option_id_membership_length_options_id_fk` FOREIGN KEY (`length_option_id`) REFERENCES `membership_length_options`(`id`),
	CONSTRAINT "membership_fees_prices_amount" CHECK("amount_minor" >= 1),
	CONSTRAINT "membership_fees_prices_applies" CHECK("applies_to" IN ('join-and-renew', 'join', 'renew'))
);
--> statement-breakpoint
CREATE TABLE `membership_length_options` (
	`id` text PRIMARY KEY,
	`scheme_id` text NOT NULL,
	`name` text NOT NULL,
	`count` integer NOT NULL,
	`state` text DEFAULT 'offered' NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_membership_length_options_scheme_id_membership_schemes_id_fk` FOREIGN KEY (`scheme_id`) REFERENCES `membership_schemes`(`id`),
	CONSTRAINT "membership_length_options_count_range" CHECK("count" BETWEEN 1 AND 120),
	CONSTRAINT "membership_length_options_state" CHECK("state" IN ('offered', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE `membership_members` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`number` integer NOT NULL,
	`first_joined_on` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "membership_members_number_positive" CHECK("number" >= 1)
);
--> statement-breakpoint
CREATE TABLE `membership_memberships` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`scheme_id` text NOT NULL,
	`length_option_id` text,
	`realm` text NOT NULL,
	`state` text NOT NULL,
	`origin` text NOT NULL,
	`renews_id` text,
	`response_id` text,
	`starts_on` text,
	`ends_on` text,
	`needs_verification` integer NOT NULL,
	`needs_approval` integer NOT NULL,
	`needs_payment` integer NOT NULL,
	`verified_at` integer,
	`approved_at` integer,
	`paid_at` integer,
	`activated_at` integer,
	`expires_at` integer,
	`ended_at` integer,
	`end_reason` text,
	`added_by` text,
	`ended_by` text,
	`note` text,
	`last_reminder` text,
	`lapse_announced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_membership_memberships_scheme_id_membership_schemes_id_fk` FOREIGN KEY (`scheme_id`) REFERENCES `membership_schemes`(`id`),
	CONSTRAINT `fk_membership_memberships_length_option_id_membership_length_options_id_fk` FOREIGN KEY (`length_option_id`) REFERENCES `membership_length_options`(`id`),
	CONSTRAINT `fk_membership_memberships_renews_id_membership_memberships_id_fk` FOREIGN KEY (`renews_id`) REFERENCES `membership_memberships`(`id`),
	CONSTRAINT "membership_memberships_realm" CHECK("realm" IN ('members', 'audience')),
	CONSTRAINT "membership_memberships_state" CHECK("state" IN ('pending', 'active', 'declined', 'expired', 'ended')),
	CONSTRAINT "membership_memberships_origin" CHECK("origin" IN ('applied', 'added', 'renewed', 'action')),
	CONSTRAINT "membership_memberships_active" CHECK("state" <> 'active' OR ("starts_on" IS NOT NULL AND "activated_at" IS NOT NULL AND ("needs_verification" = 0 OR "verified_at" IS NOT NULL) AND ("needs_approval" = 0 OR "approved_at" IS NOT NULL) AND ("needs_payment" = 0 OR "paid_at" IS NOT NULL))),
	CONSTRAINT "membership_memberships_dates" CHECK("ends_on" IS NULL OR "starts_on" IS NULL OR "ends_on" >= "starts_on"),
	CONSTRAINT "membership_memberships_ended" CHECK(("state" = 'ended') = ("end_reason" IS NOT NULL)),
	CONSTRAINT "membership_memberships_end_reason" CHECK("end_reason" IS NULL OR "end_reason" IN ('by-holder', 'by-staff', 'refunded', 'superseded', 'erased'))
);
--> statement-breakpoint
CREATE TABLE `membership_schemes` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`summary` text,
	`side` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`join_mode` text DEFAULT 'apply' NOT NULL,
	`length_rule` text NOT NULL,
	`fixed_end_month` integer,
	`fixed_end_day` integer,
	`rollover_days` integer DEFAULT 0 NOT NULL,
	`renewal_opens_days` integer NOT NULL,
	`grace_days` integer NOT NULL,
	`verifier` text,
	`verifier_config` text,
	`reverify_on_renewal` integer DEFAULT true NOT NULL,
	`needs_approval` integer DEFAULT false NOT NULL,
	`requires_payment` integer DEFAULT false NOT NULL,
	`voting` integer DEFAULT false NOT NULL,
	`accepts_reference` integer DEFAULT false NOT NULL,
	`holder_may_end` integer NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "membership_schemes_side" CHECK("side" IN ('members', 'audience')),
	CONSTRAINT "membership_schemes_state_values" CHECK("state" IN ('draft', 'open', 'closed', 'archived')),
	CONSTRAINT "membership_schemes_join_mode" CHECK("join_mode" IN ('apply', 'staff-only')),
	CONSTRAINT "membership_schemes_length_rule" CHECK("length_rule" IN ('fixed', 'rolling', 'indefinite')),
	CONSTRAINT "membership_schemes_fixed_end" CHECK(("length_rule" = 'fixed') = ("fixed_end_month" IS NOT NULL AND "fixed_end_day" IS NOT NULL)),
	CONSTRAINT "membership_schemes_fixed_end_valid" CHECK("fixed_end_month" IS NULL OR ("fixed_end_month" BETWEEN 1 AND 12 AND "fixed_end_day" BETWEEN 1 AND (CASE WHEN "fixed_end_month" = 2 THEN 28 WHEN "fixed_end_month" IN (4, 6, 9, 11) THEN 30 ELSE 31 END))),
	CONSTRAINT "membership_schemes_rollover" CHECK("rollover_days" BETWEEN 0 AND 180),
	CONSTRAINT "membership_schemes_renewal_opens" CHECK("renewal_opens_days" BETWEEN 0 AND 180),
	CONSTRAINT "membership_schemes_grace" CHECK("grace_days" BETWEEN 0 AND 90)
);
--> statement-breakpoint
CREATE TABLE `membership_verification_entries` (
	`id` text PRIMARY KEY,
	`list_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`ends_on` text,
	`holder_name` text,
	`used_by` text,
	`by_hand` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_membership_verification_entries_list_id_membership_verification_lists_id_fk` FOREIGN KEY (`list_id`) REFERENCES `membership_verification_lists`(`id`),
	CONSTRAINT `fk_membership_verification_entries_used_by_membership_memberships_id_fk` FOREIGN KEY (`used_by`) REFERENCES `membership_memberships`(`id`)
);
--> statement-breakpoint
CREATE TABLE `membership_verification_lists` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`key_kind` text NOT NULL,
	`entry_count` integer DEFAULT 0 NOT NULL,
	`valid_until` text,
	`uploaded_by` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`reference_label` text,
	`reference_noun` text,
	`reference_shape` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "membership_verification_lists_kind" CHECK("key_kind" IN ('email', 'reference')),
	CONSTRAINT "membership_verification_lists_label" CHECK("key_kind" <> 'reference' OR "reference_label" IS NOT NULL),
	CONSTRAINT "membership_verification_lists_count" CHECK("entry_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `membership_verifications` (
	`id` text PRIMARY KEY,
	`membership_id` text NOT NULL,
	`verifier` text NOT NULL,
	`outcome` text NOT NULL,
	`reason` text,
	`entry_id` text,
	`reference` text,
	`decided_by` text,
	`note` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_membership_verifications_membership_id_membership_memberships_id_fk` FOREIGN KEY (`membership_id`) REFERENCES `membership_memberships`(`id`),
	CONSTRAINT `fk_membership_verifications_entry_id_membership_verification_entries_id_fk` FOREIGN KEY (`entry_id`) REFERENCES `membership_verification_entries`(`id`),
	CONSTRAINT "membership_verifications_outcome" CHECK("outcome" IN ('passed', 'failed', 'needs-staff'))
);
--> statement-breakpoint
CREATE TABLE `payments_attempt_events` (
	`id` text PRIMARY KEY,
	`attempt_id` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`webhook_event_id` text,
	`by` text,
	`at` integer NOT NULL,
	CONSTRAINT `fk_payments_attempt_events_attempt_id_payments_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `payments_attempts`(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments_attempts` (
	`id` text PRIMARY KEY,
	`intent_id` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`method` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`state` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`provider_ref` text,
	`reader_id` text,
	`fee_minor` integer,
	`refunded_minor` integer DEFAULT 0 NOT NULL,
	`tendered_minor` integer,
	`note` text,
	`answered_by` text,
	`failure_code` text,
	`started_at` integer NOT NULL,
	`answered_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_payments_attempts_intent_id_payments_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `payments_intents`(`id`),
	CONSTRAINT `fk_payments_attempts_provider_account_id_payments_provider_accounts_id_fk` FOREIGN KEY (`provider_account_id`) REFERENCES `payments_provider_accounts`(`id`),
	CONSTRAINT `fk_payments_attempts_reader_id_payments_readers_id_fk` FOREIGN KEY (`reader_id`) REFERENCES `payments_readers`(`id`),
	CONSTRAINT "payments_attempts_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "payments_attempts_refunded" CHECK("refunded_minor" >= 0 AND "refunded_minor" <= "amount_minor"),
	CONSTRAINT "payments_attempts_method" CHECK("method" IN ('card_online', 'card_reader', 'card_attested', 'cash', 'other_attested')),
	CONSTRAINT "payments_attempts_state" CHECK("state" IN ('started', 'pending', 'succeeded', 'failed', 'cancelled', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE `payments_intent_parts` (
	`id` text PRIMARY KEY,
	`intent_id` text NOT NULL,
	`owner_module` text NOT NULL,
	`owner_record` text NOT NULL,
	`open` integer,
	`amount_minor` integer NOT NULL,
	`refunded_minor` integer DEFAULT 0 NOT NULL,
	`settled_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_payments_intent_parts_intent_id_payments_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `payments_intents`(`id`),
	CONSTRAINT "payments_intent_parts_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "payments_intent_parts_refunded" CHECK("refunded_minor" >= 0 AND "refunded_minor" <= "amount_minor"),
	CONSTRAINT "payments_intent_parts_open" CHECK("open" IS NULL OR "open" = 1)
);
--> statement-breakpoint
CREATE TABLE `payments_intents` (
	`id` text PRIMARY KEY,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`channel` text NOT NULL,
	`state` text NOT NULL,
	`expires_at` integer NOT NULL,
	`session_id` text,
	`settled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_payments_intents_session_id_payments_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `payments_sessions`(`id`),
	CONSTRAINT "payments_intents_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "payments_intents_channel" CHECK("channel" IN ('online', 'desk')),
	CONSTRAINT "payments_intents_state" CHECK("state" IN ('open', 'succeeded', 'cancelled', 'expired', 'unfulfilled'))
);
--> statement-breakpoint
CREATE TABLE `payments_provider_accounts` (
	`id` text PRIMARY KEY,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`channels` text NOT NULL,
	`mode` text NOT NULL,
	`external_ref` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "payments_provider_accounts_mode" CHECK("mode" IN ('live', 'test'))
);
--> statement-breakpoint
CREATE TABLE `payments_readers` (
	`id` text PRIMARY KEY,
	`provider_account_id` text NOT NULL,
	`label` text NOT NULL,
	`external_ref` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_payments_readers_provider_account_id_payments_provider_accounts_id_fk` FOREIGN KEY (`provider_account_id`) REFERENCES `payments_provider_accounts`(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments_refunds` (
	`id` text PRIMARY KEY,
	`attempt_id` text NOT NULL,
	`part_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`state` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`provider_ref` text,
	`requested_by` text,
	`self_approve_limit_minor` integer NOT NULL,
	`approved_by` text,
	`decline_reason_term_id` text,
	`session_id` text,
	`fee_returned_minor` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_payments_refunds_attempt_id_payments_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `payments_attempts`(`id`),
	CONSTRAINT `fk_payments_refunds_part_id_payments_intent_parts_id_fk` FOREIGN KEY (`part_id`) REFERENCES `payments_intent_parts`(`id`),
	CONSTRAINT `fk_payments_refunds_decline_reason_term_id_core_terms_id_fk` FOREIGN KEY (`decline_reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT `fk_payments_refunds_session_id_payments_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `payments_sessions`(`id`),
	CONSTRAINT "payments_refunds_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "payments_refunds_state" CHECK("state" IN ('requested', 'approved', 'sent', 'succeeded', 'failed', 'declined')),
	CONSTRAINT "payments_refunds_two_people" CHECK("approved_by" IS NULL OR "requested_by" IS NULL OR "approved_by" <> "requested_by" OR "amount_minor" <= "self_approve_limit_minor"),
	CONSTRAINT "payments_refunds_declined_reason" CHECK("state" <> 'declined' OR "decline_reason_term_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `payments_sessions` (
	`id` text PRIMARY KEY,
	`point_label` text NOT NULL,
	`space_id` text,
	`opened_by` text NOT NULL,
	`closed_by` text,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`state` text NOT NULL,
	`float_minor` integer NOT NULL,
	`expected_cash_minor` integer,
	`counted_cash_minor` integer,
	`variance_note` text,
	`closed_how` text,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "payments_sessions_state" CHECK("state" IN ('open', 'counting', 'closed')),
	CONSTRAINT "payments_sessions_float" CHECK("float_minor" >= 0),
	CONSTRAINT "payments_sessions_note" CHECK("variance_note" IS NULL OR length("variance_note") <= 200)
);
--> statement-breakpoint
CREATE TABLE `payments_till_splits` (
	`id` text PRIMARY KEY,
	`intent_id` text NOT NULL,
	`position` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`items` text NOT NULL,
	`attempt_id` text,
	`receipt_account_id` text,
	`receipt_to` text,
	`receipt_sent_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_payments_till_splits_intent_id_payments_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `payments_intents`(`id`),
	CONSTRAINT `fk_payments_till_splits_attempt_id_payments_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `payments_attempts`(`id`),
	CONSTRAINT "payments_till_splits_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "payments_till_splits_position" CHECK("position" >= 0),
	CONSTRAINT "payments_till_splits_one_receipt" CHECK("receipt_account_id" IS NULL OR "receipt_to" IS NULL)
);
--> statement-breakpoint
CREATE TABLE `payments_webhook_events` (
	`id` text PRIMARY KEY,
	`provider_account_id` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`type` text NOT NULL,
	`signature_ok` integer NOT NULL,
	`attempt_id` text,
	`received_at` integer NOT NULL,
	`handled_at` integer,
	CONSTRAINT `fk_payments_webhook_events_provider_account_id_payments_provider_accounts_id_fk` FOREIGN KEY (`provider_account_id`) REFERENCES `payments_provider_accounts`(`id`),
	CONSTRAINT `fk_payments_webhook_events_attempt_id_payments_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `payments_attempts`(`id`)
);
--> statement-breakpoint
CREATE TABLE `promotions_codes` (
	`id` text PRIMARY KEY,
	`promotion_id` text NOT NULL,
	`code` text NOT NULL,
	`max_uses` integer,
	`used` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_promotions_codes_promotion_id_promotions_promotions_id_fk` FOREIGN KEY (`promotion_id`) REFERENCES `promotions_promotions`(`id`),
	CONSTRAINT "promotions_codes_used" CHECK("used" >= 0 AND ("max_uses" IS NULL OR "used" <= "max_uses"))
);
--> statement-breakpoint
CREATE TABLE `promotions_promotions` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`label` text NOT NULL,
	`trigger` text NOT NULL,
	`effect` text NOT NULL,
	`value` integer NOT NULL,
	`buy_quantity` integer,
	`free_quantity` integer,
	`channel` text DEFAULT 'all' NOT NULL,
	`valid_from` integer,
	`valid_until` integer,
	`schedule` text,
	`requirement_refs` text,
	`min_spend_minor` integer,
	`max_uses` integer,
	`used` integer DEFAULT 0 NOT NULL,
	`count_by` text DEFAULT 'item' NOT NULL,
	`max_per_sale` integer,
	`max_per_person` integer,
	`combines` integer DEFAULT false NOT NULL,
	`not_with_requirements` integer DEFAULT false NOT NULL,
	`staff_ability` text,
	`needs_reason` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "promotions_promotions_trigger" CHECK("trigger" IN ('automatic', 'code', 'staff')),
	CONSTRAINT "promotions_promotions_effect" CHECK("effect" IN ('percent_off', 'amount_off', 'set_price', 'multi_buy', 'basket_amount_off')),
	CONSTRAINT "promotions_promotions_channel" CHECK("channel" IN ('all', 'online', 'till')),
	CONSTRAINT "promotions_promotions_count_by" CHECK("count_by" IN ('item', 'sale')),
	CONSTRAINT "promotions_promotions_value" CHECK("value" >= 0 AND ("effect" <> 'percent_off' OR ("value" >= 1 AND "value" <= 10000))),
	CONSTRAINT "promotions_promotions_multi_buy" CHECK("effect" <> 'multi_buy' OR ("buy_quantity" >= 2 AND ("free_quantity" IS NULL OR ("free_quantity" >= 1 AND "free_quantity" < "buy_quantity")))),
	CONSTRAINT "promotions_promotions_used" CHECK("used" >= 0 AND ("max_uses" IS NULL OR "used" <= "max_uses"))
);
--> statement-breakpoint
CREATE TABLE `promotions_redemptions` (
	`id` text PRIMARY KEY,
	`promotion_id` text NOT NULL,
	`code_id` text,
	`kind` text NOT NULL,
	`sale_ref` text NOT NULL,
	`ref` text NOT NULL,
	`uses` integer NOT NULL,
	`discount_minor` integer NOT NULL,
	`reason` text,
	`applied_by` text,
	`state` text DEFAULT 'live' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_promotions_redemptions_promotion_id_promotions_promotions_id_fk` FOREIGN KEY (`promotion_id`) REFERENCES `promotions_promotions`(`id`),
	CONSTRAINT `fk_promotions_redemptions_code_id_promotions_codes_id_fk` FOREIGN KEY (`code_id`) REFERENCES `promotions_codes`(`id`),
	CONSTRAINT "promotions_redemptions_state" CHECK("state" IN ('live', 'released')),
	CONSTRAINT "promotions_redemptions_uses" CHECK("uses" >= 0),
	CONSTRAINT "promotions_redemptions_discount" CHECK("discount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `promotions_targets` (
	`id` text PRIMARY KEY,
	`promotion_id` text NOT NULL,
	`role` text NOT NULL,
	`kind` text NOT NULL,
	`scope` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_promotions_targets_promotion_id_promotions_promotions_id_fk` FOREIGN KEY (`promotion_id`) REFERENCES `promotions_promotions`(`id`),
	CONSTRAINT "promotions_targets_role" CHECK("role" IN ('applies', 'requires')),
	CONSTRAINT "promotions_targets_quantity" CHECK("quantity" >= 1)
);
--> statement-breakpoint
CREATE INDEX `awards_awards_type` ON `awards_awards` (`type_id`,`state`,`awarded_on`);--> statement-breakpoint
CREATE INDEX `awards_awards_account` ON `awards_awards` (`account_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `awards_types_key` ON `awards_types` (`key`);--> statement-breakpoint
CREATE INDEX `awards_types_state` ON `awards_types` (`state`,`position`);--> statement-breakpoint
CREATE INDEX `bar_age_checks_at` ON `bar_age_checks` (`at`);--> statement-breakpoint
CREATE INDEX `bar_age_checks_sale` ON `bar_age_checks` (`sale_id`);--> statement-breakpoint
CREATE INDEX `bar_age_checks_basket` ON `bar_age_checks` (`basket_key`);--> statement-breakpoint
CREATE INDEX `bar_allergen_checks_product` ON `bar_allergen_checks` (`product_id`,`at`);--> statement-breakpoint
CREATE INDEX `bar_allergen_checks_option` ON `bar_allergen_checks` (`option_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_allergen_entries_product` ON `bar_allergen_entries` (`product_id`,`allergen`) WHERE product_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_allergen_entries_option` ON `bar_allergen_entries` (`option_id`,`allergen`) WHERE option_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_allergen_entries_stock_item` ON `bar_allergen_entries` (`stock_item_id`,`allergen`) WHERE stock_item_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_categories_name` ON `bar_categories` (lower("name"));--> statement-breakpoint
CREATE INDEX `bar_categories_parent` ON `bar_categories` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_choice_groups_name` ON `bar_choice_groups` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `bar_choice_options_name` ON `bar_choice_options` (`group_id`,lower("name"));--> statement-breakpoint
CREATE INDEX `bar_deliveries_state` ON `bar_deliveries` (`state`,`received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_delivery_lines_item` ON `bar_delivery_lines` (`delivery_id`,`stock_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_openings_one_open` ON `bar_openings` (`outlet_id`) WHERE state = 'open';--> statement-breakpoint
CREATE INDEX `bar_openings_day` ON `bar_openings` (`operating_day`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_outlet_favourites_pair` ON `bar_outlet_favourites` (`outlet_id`,`variant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_outlets_name` ON `bar_outlets` (lower("name")) WHERE active = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_outlets_one_desk` ON `bar_outlets` (`kind`) WHERE kind = 'desk' AND active = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_price_lists_name` ON `bar_price_lists` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `bar_price_lists_system_key` ON `bar_price_lists` (`system_key`) WHERE system_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX `bar_prices_in_force` ON `bar_prices` (`variant_id`,`price_list_id`,`effective_from`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_product_choice_groups_pair` ON `bar_product_choice_groups` (`product_id`,`group_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_product_presets_name` ON `bar_product_presets` (lower("name")) WHERE active = 1;--> statement-breakpoint
CREATE INDEX `bar_products_category` ON `bar_products` (`category_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_recipe_lines_item` ON `bar_recipe_lines` (`variant_id`,`stock_item_id`) WHERE stock_item_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_recipe_lines_group` ON `bar_recipe_lines` (`variant_id`,`choice_group_id`) WHERE choice_group_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `bar_register_reviews_at` ON `bar_register_reviews` (`reviewed_at`);--> statement-breakpoint
CREATE INDEX `bar_sale_line_choices_line` ON `bar_sale_line_choices` (`sale_line_id`);--> statement-breakpoint
CREATE INDEX `bar_sale_lines_sale` ON `bar_sale_lines` (`sale_id`);--> statement-breakpoint
CREATE INDEX `bar_sale_reversals_line` ON `bar_sale_reversals` (`sale_line_id`,`state`);--> statement-breakpoint
CREATE INDEX `bar_sale_reversals_refund` ON `bar_sale_reversals` (`refund_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_sales_reference` ON `bar_sales` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_sales_client_key` ON `bar_sales` (`client_key`);--> statement-breakpoint
CREATE INDEX `bar_sales_opening` ON `bar_sales` (`opening_id`,`state`);--> statement-breakpoint
CREATE INDEX `bar_sales_intent` ON `bar_sales` (`intent_id`);--> statement-breakpoint
CREATE INDEX `bar_stock_item_allergen_checks_item` ON `bar_stock_item_allergen_checks` (`stock_item_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_stock_items_name` ON `bar_stock_items` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `bar_stock_locations_name` ON `bar_stock_locations` (lower("name")) WHERE active = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_stock_movements_key` ON `bar_stock_movements` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `bar_stock_movements_level` ON `bar_stock_movements` (`stock_item_id`,`location_id`,`at`);--> statement-breakpoint
CREATE INDEX `bar_stock_movements_source` ON `bar_stock_movements` (`source_type`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_stocktake_lines_item` ON `bar_stocktake_lines` (`stocktake_id`,`stock_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_stocktakes_live` ON `bar_stocktakes` (`location_id`) WHERE state IN ('counting', 'submitted');--> statement-breakpoint
CREATE INDEX `bar_stocktakes_state` ON `bar_stocktakes` (`state`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_variants_name` ON `bar_variants` (`product_id`,lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `bar_variants_barcode` ON `bar_variants` (`barcode`) WHERE barcode IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_variants_one_mixer` ON `bar_variants` (`product_id`) WHERE mixer_measure = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_bands_name` ON `box_office_bands` (`production_id`,`name`);--> statement-breakpoint
CREATE INDEX `box_office_cancellations_order` ON `box_office_cancellations` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_claims_one_live_per_seat` ON `box_office_claims` (`pool_id`,`seat_id`) WHERE seat_id IS NOT NULL AND state IN ('held', 'confirmed');--> statement-breakpoint
CREATE INDEX `box_office_claims_pool` ON `box_office_claims` (`pool_id`,`state`,`expires_at`);--> statement-breakpoint
CREATE INDEX `box_office_claims_hold` ON `box_office_claims` (`hold_id`);--> statement-breakpoint
CREATE INDEX `box_office_comp_requests_performance` ON `box_office_comp_requests` (`performance_id`,`state`);--> statement-breakpoint
CREATE INDEX `box_office_comp_requests_state` ON `box_office_comp_requests` (`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `box_office_exchanges_order` ON `box_office_exchanges` (`order_id`);--> statement-breakpoint
CREATE INDEX `box_office_exchanges_intent` ON `box_office_exchanges` (`intent_id`) WHERE intent_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_holds_order` ON `box_office_holds` (`order_id`) WHERE order_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_order_lines_order` ON `box_office_order_lines` (`order_id`);--> statement-breakpoint
CREATE INDEX `box_office_order_lines_performance` ON `box_office_order_lines` (`performance_id`,`state`) WHERE performance_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_order_lines_requirement` ON `box_office_order_lines` (`performance_id`,`ticket_type_id`) WHERE requirement_ref IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_order_lines_claim` ON `box_office_order_lines` (`claim_id`) WHERE claim_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_orders_reference` ON `box_office_orders` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_orders_basket_token` ON `box_office_orders` (`basket_token_hash`) WHERE basket_token_hash IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_orders_confirm_token` ON `box_office_orders` (`confirm_token_hash`) WHERE confirm_token_hash IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_orders_link` ON `box_office_orders` (`link_token_hash`) WHERE link_token_hash IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_orders_desk_code` ON `box_office_orders` (`desk_code_hash`) WHERE desk_code_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_orders_account` ON `box_office_orders` (`account_id`) WHERE account_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_orders_expiring` ON `box_office_orders` (`state`,`expires_at`);--> statement-breakpoint
CREATE INDEX `box_office_orders_releasing` ON `box_office_orders` (`state`,`release_at`);--> statement-breakpoint
CREATE INDEX `box_office_orders_created` ON `box_office_orders` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_pass_prices_name` ON `box_office_pass_prices` (`pass_type_id`,lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_pass_redemptions_performance` ON `box_office_pass_redemptions` (`pass_id`,`performance_id`) WHERE state = 'live';--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_pass_redemptions_show` ON `box_office_pass_redemptions` (`pass_id`,`production_id`) WHERE state = 'live' AND once = 1;--> statement-breakpoint
CREATE INDEX `box_office_pass_redemptions_order` ON `box_office_pass_redemptions` (`order_id`);--> statement-breakpoint
CREATE INDEX `box_office_pass_redemptions_claim` ON `box_office_pass_redemptions` (`claim_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_pass_shows_one` ON `box_office_pass_shows` (`pass_type_id`,`production_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_pass_types_name` ON `box_office_pass_types` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_passes_code` ON `box_office_passes` (`code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_passes_alias` ON `box_office_passes` (`alias_hash`) WHERE alias_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_passes_account` ON `box_office_passes` (`account_id`) WHERE account_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_passes_type` ON `box_office_passes` (`pass_type_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_passes_line` ON `box_office_passes` (`order_line_id`) WHERE order_line_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_performance_sales_performance` ON `box_office_performance_sales` (`performance_id`);--> statement-breakpoint
CREATE INDEX `box_office_performance_sales_due` ON `box_office_performance_sales` (`state`,`on_sale_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_pools_band` ON `box_office_pools` (`performance_id`,`band_id`);--> statement-breakpoint
CREATE INDEX `box_office_prices_lookup` ON `box_office_prices` (`production_id`,`band_id`,`ticket_type_id`,`effective_from`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_run_layouts_production` ON `box_office_run_layouts` (`production_id`);--> statement-breakpoint
CREATE INDEX `box_office_scans_ticket` ON `box_office_scans` (`ticket_id`) WHERE ticket_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_scans_performance` ON `box_office_scans` (`performance_id`,`received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_seating_layouts_name` ON `box_office_seating_layouts` (`space_id`,lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_seating_layouts_usual` ON `box_office_seating_layouts` (`space_id`) WHERE usual = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_space_ticket_presets_space` ON `box_office_space_ticket_presets` (`space_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_ticket_presets_name` ON `box_office_ticket_presets` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_ticket_types_name` ON `box_office_ticket_types` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_ticket_types_managed` ON `box_office_ticket_types` (`managed_by`) WHERE managed_by IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_tickets_code` ON `box_office_tickets` (`code_hash`);--> statement-breakpoint
CREATE INDEX `box_office_tickets_line` ON `box_office_tickets` (`order_line_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_tickets_one_valid` ON `box_office_tickets` (`order_line_id`) WHERE state = 'valid';--> statement-breakpoint
CREATE INDEX `box_office_tickets_performance` ON `box_office_tickets` (`performance_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_account_emails_address` ON `core_account_emails` (`address`);--> statement-breakpoint
CREATE INDEX `core_account_emails_account` ON `core_account_emails` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_account_merges_merged_account` ON `core_account_merges` (`merged_account_id`) WHERE undone_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `core_account_tokens_hash` ON `core_account_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `core_account_tokens_address` ON `core_account_tokens` (`purpose`,`address`,`created_at`);--> statement-breakpoint
CREATE INDEX `core_account_tokens_expiry` ON `core_account_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `core_accounts_merged_into` ON `core_accounts` (`merged_into_id`);--> statement-breakpoint
CREATE INDEX `core_accounts_name` ON `core_accounts` (`name`);--> statement-breakpoint
CREATE INDEX `core_audit_record` ON `core_audit` (`record_type`,`record_id`,`at`);--> statement-breakpoint
CREATE INDEX `core_audit_actor` ON `core_audit` (`actor_account_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_authenticators_account` ON `core_authenticators` (`account_id`);--> statement-breakpoint
CREATE INDEX `core_closures_time` ON `core_closures` (`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `core_closures_venue` ON `core_closures` (`venue_id`,`starts_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_closures_feed_ref` ON `core_closures` (`feed_ref`) WHERE "core_closures"."feed_ref" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `core_data_requests_account` ON `core_data_requests` (`account_id`,`kind`,`state`);--> statement-breakpoint
CREATE INDEX `core_data_requests_state` ON `core_data_requests` (`state`,`not_before`);--> statement-breakpoint
CREATE INDEX `core_data_requests_respond_by` ON `core_data_requests` (`respond_by`);--> statement-breakpoint
CREATE INDEX `core_email_events_set_aside_at` ON `core_email_events_set_aside` (`set_aside_at`);--> statement-breakpoint
CREATE INDEX `core_emergency_contacts_account` ON `core_emergency_contacts` (`account_id`);--> statement-breakpoint
CREATE INDEX `core_events_name` ON `core_events` (`name`,`announced_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_external_calls_attempt` ON `core_external_calls` (`idempotency_key`) WHERE phase = 'attempt';--> statement-breakpoint
CREATE UNIQUE INDEX `core_external_calls_outcome` ON `core_external_calls` (`idempotency_key`) WHERE phase = 'outcome' AND result != 'unknown';--> statement-breakpoint
CREATE UNIQUE INDEX `core_federated_identities_subject` ON `core_federated_identities` (`provider`,`subject`);--> statement-breakpoint
CREATE INDEX `core_federated_identities_account` ON `core_federated_identities` (`account_id`);--> statement-breakpoint
CREATE INDEX `core_files_owner` ON `core_files` (`owner_type`,`owner_id`,`slot`,`sort`);--> statement-breakpoint
CREATE INDEX `core_files_purge` ON `core_files` (`state`,`purge_after`);--> statement-breakpoint
CREATE INDEX `core_files_expiry` ON `core_files` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_grant_ends_grant` ON `core_grant_ends` (`grant_id`);--> statement-breakpoint
CREATE INDEX `core_grants_account` ON `core_grants` (`account_id`);--> statement-breakpoint
CREATE INDEX `core_grants_role` ON `core_grants` (`role_id`);--> statement-breakpoint
CREATE INDEX `core_grants_expiry` ON `core_grants` (`expires_at`);--> statement-breakpoint
CREATE INDEX `core_inbox_items_account` ON `core_inbox_items` (`account_id`,`side`,`archived_at`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_jobs_dedupe` ON `core_jobs` (`name`,`dedupe_key`) WHERE dedupe_key IS NOT NULL AND state IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX `core_jobs_due` ON `core_jobs` (`state`,`run_after`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_notification_deliveries_channel` ON `core_notification_deliveries` (`notification_id`,`channel`);--> statement-breakpoint
CREATE INDEX `core_notification_deliveries_due` ON `core_notification_deliveries` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `core_notification_deliveries_provider` ON `core_notification_deliveries` (`provider_ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_notifications_dedupe_account` ON `core_notifications` (`dedupe_key`,coalesce("account_id", '')) WHERE "core_notifications"."dedupe_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `core_notifications_subject` ON `core_notifications` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `core_notifications_account` ON `core_notifications` (`account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `core_passkey_challenges_expiry` ON `core_passkey_challenges` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_passkeys_credential` ON `core_passkeys` (`credential_id`);--> statement-breakpoint
CREATE INDEX `core_passkeys_account` ON `core_passkeys` (`account_id`);--> statement-breakpoint
CREATE INDEX `core_performance_runs_production` ON `core_performance_runs` (`production_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `core_performances_starts` ON `core_performances` (`starts_at`);--> statement-breakpoint
CREATE INDEX `core_performances_day` ON `core_performances` (`operating_day`);--> statement-breakpoint
CREATE INDEX `core_performances_production` ON `core_performances` (`production_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `core_performances_venue` ON `core_performances` (`venue_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `core_performances_space` ON `core_performances` (`space_id`,`starts_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_performances_run` ON `core_performances` (`run_id`,`starts_at`) WHERE "core_performances"."run_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `core_place_access_term` ON `core_place_access` (`venue_id`,coalesce("space_id", ''),`term_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_policy_versions_number` ON `core_policy_versions` (`policy`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_policy_versions_hash` ON `core_policy_versions` (`policy`,`hash`);--> statement-breakpoint
CREATE INDEX `core_production_credits_order` ON `core_production_credits` (`production_id`,`section_term_id`,`sort`);--> statement-breakpoint
CREATE INDEX `core_production_credits_account` ON `core_production_credits` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_productions_slug` ON `core_productions` (`slug`);--> statement-breakpoint
CREATE INDEX `core_productions_listing` ON `core_productions` (`state`,`last_ends_at`);--> statement-breakpoint
CREATE INDEX `core_productions_season` ON `core_productions` (`season_id`);--> statement-breakpoint
CREATE INDEX `core_productions_category` ON `core_productions` (`category_term_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_recovery_codes_hash` ON `core_recovery_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `core_recovery_codes_account` ON `core_recovery_codes` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_roles_key` ON `core_roles` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_run_presets_name` ON `core_run_presets` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `core_seasons_slug` ON `core_seasons` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_seasons_name` ON `core_seasons` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `core_sender_identities_local_part` ON `core_sender_identities` (`local_part`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_sessions_token` ON `core_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `core_sessions_account` ON `core_sessions` (`account_id`,`ended_at`);--> statement-breakpoint
CREATE INDEX `core_setting_changes_key` ON `core_setting_changes` (`key`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_signing_keys_current` ON `core_signing_keys` (`purpose`) WHERE state = 'current';--> statement-breakpoint
CREATE INDEX `core_signing_keys_purpose` ON `core_signing_keys` (`purpose`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_spaces_venue_pair` ON `core_spaces` (`id`,`venue_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_spaces_slug` ON `core_spaces` (`venue_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_spaces_name` ON `core_spaces` (`venue_id`,lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `core_term_groups_label` ON `core_term_groups` (`vocabulary_key`,lower("label"));--> statement-breakpoint
CREATE INDEX `core_term_groups_order` ON `core_term_groups` (`vocabulary_key`,`sort`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_terms_slug` ON `core_terms` (`vocabulary_key`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_terms_live_label` ON `core_terms` (`vocabulary_key`,lower("label")) WHERE "core_terms"."retired_at" IS NULL;--> statement-breakpoint
CREATE INDEX `core_terms_order` ON `core_terms` (`vocabulary_key`,`sort`);--> statement-breakpoint
CREATE INDEX `core_terms_group` ON `core_terms` (`group_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_venues_name` ON `core_venues` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `core_webhook_deliveries_event` ON `core_webhook_deliveries` (`webhook_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `core_webhook_deliveries_due` ON `core_webhook_deliveries` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `core_webhook_deliveries_log` ON `core_webhook_deliveries` (`webhook_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_webhooks_name` ON `core_webhooks` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `finance_accounts_code` ON `finance_accounts` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_accounts_system_key` ON `finance_accounts` (`system_key`,coalesce("scope", '')) WHERE system_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX `finance_entries_posting` ON `finance_entries` (`posting_id`);--> statement-breakpoint
CREATE INDEX `finance_entries_account` ON `finance_entries` (`account_id`);--> statement-breakpoint
CREATE INDEX `finance_entries_production` ON `finance_entries` (`production_id`) WHERE production_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `finance_entries_performance` ON `finance_entries` (`performance_id`) WHERE performance_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `finance_period_closes_period` ON `finance_period_closes` (`period_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_periods_starts_on` ON `finance_periods` (`starts_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_postings_idempotency_key` ON `finance_postings` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_postings_reverses` ON `finance_postings` (`reverses_id`) WHERE reverses_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `finance_postings_period` ON `finance_postings` (`period_id`);--> statement-breakpoint
CREATE INDEX `finance_postings_occurred` ON `finance_postings` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `finance_postings_source` ON `finance_postings` (`source_module`,`source_type`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_seals_posting` ON `finance_seals` (`posting_id`);--> statement-breakpoint
CREATE INDEX `forms_action_runs_response` ON `forms_action_runs` (`response_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `forms_answers_text` ON `forms_answers` (`question_id`,`value_text`);--> statement-breakpoint
CREATE INDEX `forms_answers_number` ON `forms_answers` (`question_id`,`value_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_fields_key` ON `forms_fields` (`form_id`,`key`);--> statement-breakpoint
CREATE INDEX `forms_fields_form` ON `forms_fields` (`form_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_forms_slug` ON `forms_forms` (`slug`);--> statement-breakpoint
CREATE INDEX `forms_old_addresses_form` ON `forms_old_addresses` (`form_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_placements_place` ON `forms_placements` (`slot_key`,`subject_type`,`subject_id`,`form_id`);--> statement-breakpoint
CREATE INDEX `forms_placements_form` ON `forms_placements` (`form_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_responses_reference` ON `forms_responses` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_responses_unique` ON `forms_responses` (`placement_id`,`unique_key`);--> statement-breakpoint
CREATE INDEX `forms_responses_form` ON `forms_responses` (`form_id`,`state`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `forms_responses_person` ON `forms_responses` (`person_id`);--> statement-breakpoint
CREATE INDEX `forms_responses_retention` ON `forms_responses` (`retention_due_at`);--> statement-breakpoint
CREATE INDEX `forms_responses_waiting` ON `forms_responses` (`state`,`stage_kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_responses_change_token` ON `forms_responses` (`change_token_hash`) WHERE change_token_hash IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `forms_review_assignments_one` ON `forms_review_assignments` (`round_id`,`reviewer_id`);--> statement-breakpoint
CREATE INDEX `forms_review_assignments_reviewer` ON `forms_review_assignments` (`reviewer_id`,`status`);--> statement-breakpoint
CREATE INDEX `forms_review_assignments_response` ON `forms_review_assignments` (`response_id`);--> statement-breakpoint
CREATE INDEX `forms_review_rounds_response` ON `forms_review_rounds` (`response_id`,`opened_at`);--> statement-breakpoint
CREATE INDEX `forms_stage_history_response` ON `forms_stage_history` (`response_id`,`at`);--> statement-breakpoint
CREATE INDEX `forms_stage_notes_response` ON `forms_stage_notes` (`response_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_versions_number` ON `forms_versions` (`form_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_assignments_live` ON `front_of_house_assignments` (`shift_id`,`account_id`) WHERE state IN ('requested', 'confirmed', 'release_requested', 'checked_in');--> statement-breakpoint
CREATE INDEX `front_of_house_assignments_account` ON `front_of_house_assignments` (`account_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_calendar_feeds_token` ON `front_of_house_calendar_feeds` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_checklist_entries_item` ON `front_of_house_checklist_entries` (`run_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `front_of_house_checklist_items_list` ON `front_of_house_checklist_items` (`checklist_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_checklist_runs_performance` ON `front_of_house_checklist_runs` (`checklist_id`,`performance_id`) WHERE performance_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_checklist_runs_day` ON `front_of_house_checklist_runs` (`checklist_id`,coalesce("venue_id", ''),`local_date`) WHERE performance_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_duties_name` ON `front_of_house_duties` (`name`) WHERE archived_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_emergency_cards_venue` ON `front_of_house_emergency_cards` (`venue_id`);--> statement-breakpoint
CREATE INDEX `front_of_house_incident_actions_incident` ON `front_of_house_incident_actions` (`incident_id`);--> statement-breakpoint
CREATE INDEX `front_of_house_incident_actions_due` ON `front_of_house_incident_actions` (`state`,`due_on`);--> statement-breakpoint
CREATE INDEX `front_of_house_incident_people_incident` ON `front_of_house_incident_people` (`incident_id`);--> statement-breakpoint
CREATE INDEX `front_of_house_incident_people_account` ON `front_of_house_incident_people` (`account_id`) WHERE account_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `front_of_house_incident_updates_incident` ON `front_of_house_incident_updates` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_incidents_number` ON `front_of_house_incidents` (`year`,`number`);--> statement-breakpoint
CREATE INDEX `front_of_house_incidents_state` ON `front_of_house_incidents` (`state`,`reported_at`);--> statement-breakpoint
CREATE INDEX `front_of_house_incidents_reporter` ON `front_of_house_incidents` (`reported_by`);--> statement-breakpoint
CREATE INDEX `front_of_house_night_report_notes_report` ON `front_of_house_night_report_notes` (`report_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_night_reports_performance` ON `front_of_house_night_reports` (`performance_id`);--> statement-breakpoint
CREATE INDEX `front_of_house_night_reports_state` ON `front_of_house_night_reports` (`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_rota_templates_name` ON `front_of_house_rota_templates` (`name`) WHERE archived_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_rota_templates_default` ON `front_of_house_rota_templates` (coalesce("venue_id", '')) WHERE is_default = 1 AND archived_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_shifts_duty` ON `front_of_house_shifts` (`performance_id`,`duty_id`) WHERE performance_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `front_of_house_shifts_window` ON `front_of_house_shifts` (`state`,`window_closes_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_timings_kind` ON `front_of_house_timings` (`performance_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_fees_charges_once` ON `membership_fees_charges` (`membership_id`) WHERE state <> 'void';--> statement-breakpoint
CREATE INDEX `membership_fees_charges_intent` ON `membership_fees_charges` (`intent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_fees_prices_one_a_day` ON `membership_fees_prices` (`scheme_id`,coalesce(length_option_id, ''),`applies_to`,`from_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_length_options_count` ON `membership_length_options` (`scheme_id`,`count`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_members_account` ON `membership_members` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_members_number` ON `membership_members` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_memberships_one_pending` ON `membership_memberships` (`account_id`,`scheme_id`) WHERE state = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `membership_memberships_renewed_once` ON `membership_memberships` (`renews_id`) WHERE state IN ('pending', 'active') AND renews_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `membership_memberships_standing` ON `membership_memberships` (`account_id`,`state`,`starts_on`,`ends_on`);--> statement-breakpoint
CREATE INDEX `membership_memberships_scheme` ON `membership_memberships` (`scheme_id`,`state`,`ends_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_schemes_key` ON `membership_schemes` (`key`);--> statement-breakpoint
CREATE INDEX `membership_schemes_state` ON `membership_schemes` (`state`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_verification_entries_key` ON `membership_verification_entries` (`list_id`,`key_hash`);--> statement-breakpoint
CREATE INDEX `membership_verifications_membership` ON `membership_verifications` (`membership_id`);--> statement-breakpoint
CREATE INDEX `payments_attempt_events_attempt` ON `payments_attempt_events` (`attempt_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_attempts_idempotency_key` ON `payments_attempts` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_attempts_provider_ref` ON `payments_attempts` (`provider_account_id`,`provider_ref`) WHERE provider_ref IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_attempts_reader_busy` ON `payments_attempts` (`reader_id`) WHERE reader_id IS NOT NULL AND state IN ('started', 'pending');--> statement-breakpoint
CREATE INDEX `payments_attempts_intent` ON `payments_attempts` (`intent_id`);--> statement-breakpoint
CREATE INDEX `payments_attempts_waiting` ON `payments_attempts` (`state`) WHERE state IN ('pending', 'unknown');--> statement-breakpoint
CREATE UNIQUE INDEX `payments_intent_parts_owner` ON `payments_intent_parts` (`intent_id`,`owner_module`,`owner_record`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_intent_parts_one_open` ON `payments_intent_parts` (`owner_module`,`owner_record`) WHERE open = 1;--> statement-breakpoint
CREATE INDEX `payments_intents_open` ON `payments_intents` (`state`,`expires_at`);--> statement-breakpoint
CREATE INDEX `payments_intents_session` ON `payments_intents` (`session_id`) WHERE session_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_refunds_idempotency_key` ON `payments_refunds` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `payments_refunds_part` ON `payments_refunds` (`part_id`);--> statement-breakpoint
CREATE INDEX `payments_refunds_created` ON `payments_refunds` (`created_at`);--> statement-breakpoint
CREATE INDEX `payments_refunds_waiting` ON `payments_refunds` (`state`) WHERE state IN ('requested', 'approved', 'sent', 'failed');--> statement-breakpoint
CREATE UNIQUE INDEX `payments_sessions_one_open` ON `payments_sessions` (`opened_by`) WHERE state = 'open';--> statement-breakpoint
CREATE INDEX `payments_sessions_opened` ON `payments_sessions` (`opened_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_till_splits_position` ON `payments_till_splits` (`intent_id`,`position`);--> statement-breakpoint
CREATE INDEX `payments_till_splits_attempt` ON `payments_till_splits` (`attempt_id`) WHERE attempt_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_till_splits_account` ON `payments_till_splits` (`receipt_account_id`) WHERE receipt_account_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_webhook_events_event` ON `payments_webhook_events` (`provider_account_id`,`provider_event_id`) WHERE signature_ok = 1;--> statement-breakpoint
CREATE INDEX `payments_webhook_events_received` ON `payments_webhook_events` (`received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `promotions_codes_code` ON `promotions_codes` (`code`);--> statement-breakpoint
CREATE INDEX `promotions_codes_promotion` ON `promotions_codes` (`promotion_id`);--> statement-breakpoint
CREATE INDEX `promotions_promotions_live` ON `promotions_promotions` (`active`,`trigger`);--> statement-breakpoint
CREATE INDEX `promotions_redemptions_promotion` ON `promotions_redemptions` (`promotion_id`,`state`);--> statement-breakpoint
CREATE INDEX `promotions_redemptions_ref` ON `promotions_redemptions` (`kind`,`ref`);--> statement-breakpoint
CREATE INDEX `promotions_redemptions_sale` ON `promotions_redemptions` (`sale_ref`);--> statement-breakpoint
CREATE INDEX `promotions_targets_promotion` ON `promotions_targets` (`promotion_id`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `membership_verifications_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `membership_verifications_append_only_delete` BEFORE DELETE ON `membership_verifications` BEGIN SELECT RAISE(ABORT, 'append-only: membership_verifications'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `membership_verifications_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `membership_verifications_append_only_update` BEFORE UPDATE ON `membership_verifications` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`membership_id` IS OLD.`membership_id` AND NEW.`verifier` IS OLD.`verifier` AND NEW.`outcome` IS OLD.`outcome` AND NEW.`reason` IS OLD.`reason` AND NEW.`entry_id` IS OLD.`entry_id` AND (NEW.`reference` IS OLD.`reference` OR NEW.`reference` IS NULL) AND NEW.`decided_by` IS OLD.`decided_by` AND (NEW.`note` IS OLD.`note` OR NEW.`note` IS '[removed]') AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: membership_verifications'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_prices_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_prices_append_only_delete` BEFORE DELETE ON `bar_prices` BEGIN SELECT RAISE(ABORT, 'append-only: bar_prices'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_prices_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_prices_append_only_update` BEFORE UPDATE ON `bar_prices` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`variant_id` IS OLD.`variant_id` AND NEW.`price_list_id` IS OLD.`price_list_id` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`currency` IS OLD.`currency` AND NEW.`effective_from` IS OLD.`effective_from` AND NEW.`set_by` IS OLD.`set_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_prices'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_age_checks_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_age_checks_append_only_delete` BEFORE DELETE ON `bar_age_checks` BEGIN SELECT RAISE(ABORT, 'append-only: bar_age_checks'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_age_checks_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_age_checks_append_only_update` BEFORE UPDATE ON `bar_age_checks` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`opening_id` IS OLD.`opening_id` AND NEW.`sale_id` IS OLD.`sale_id` AND NEW.`outcome` IS OLD.`outcome` AND NEW.`refusal_term` IS OLD.`refusal_term` AND NEW.`variant_id` IS OLD.`variant_id` AND NEW.`basket_key` IS OLD.`basket_key` AND NEW.`id_type` IS OLD.`id_type` AND NEW.`refusal_scope` IS OLD.`refusal_scope` AND (NEW.`description` IS OLD.`description` OR NEW.`description` IS NULL) AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_age_checks'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_register_reviews_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_register_reviews_append_only_delete` BEFORE DELETE ON `bar_register_reviews` BEGIN SELECT RAISE(ABORT, 'append-only: bar_register_reviews'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_register_reviews_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_register_reviews_append_only_update` BEFORE UPDATE ON `bar_register_reviews` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`outlet_id` IS OLD.`outlet_id` AND NEW.`from_day` IS OLD.`from_day` AND NEW.`to_day` IS OLD.`to_day` AND NEW.`refusals` IS OLD.`refusals` AND NEW.`reviewed_by` IS OLD.`reviewed_by` AND NEW.`reviewed_at` IS OLD.`reviewed_at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_register_reviews'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_allergen_checks_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_allergen_checks_append_only_delete` BEFORE DELETE ON `bar_allergen_checks` BEGIN SELECT RAISE(ABORT, 'append-only: bar_allergen_checks'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_allergen_checks_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_allergen_checks_append_only_update` BEFORE UPDATE ON `bar_allergen_checks` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`product_id` IS OLD.`product_id` AND NEW.`option_id` IS OLD.`option_id` AND NEW.`source` IS OLD.`source` AND NEW.`contains` IS OLD.`contains` AND NEW.`may_contain` IS OLD.`may_contain` AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_allergen_checks'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_stock_item_allergen_checks_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_item_allergen_checks_append_only_delete` BEFORE DELETE ON `bar_stock_item_allergen_checks` BEGIN SELECT RAISE(ABORT, 'append-only: bar_stock_item_allergen_checks'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_stock_item_allergen_checks_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_item_allergen_checks_append_only_update` BEFORE UPDATE ON `bar_stock_item_allergen_checks` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`stock_item_id` IS OLD.`stock_item_id` AND NEW.`source` IS OLD.`source` AND NEW.`contains` IS OLD.`contains` AND NEW.`may_contain` IS OLD.`may_contain` AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_stock_item_allergen_checks'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_stock_movements_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_movements_append_only_delete` BEFORE DELETE ON `bar_stock_movements` BEGIN SELECT RAISE(ABORT, 'append-only: bar_stock_movements'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_stock_movements_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_movements_append_only_update` BEFORE UPDATE ON `bar_stock_movements` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`stock_item_id` IS OLD.`stock_item_id` AND NEW.`location_id` IS OLD.`location_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`quantity` IS OLD.`quantity` AND NEW.`reason_term` IS OLD.`reason_term` AND NEW.`source_type` IS OLD.`source_type` AND NEW.`source_id` IS OLD.`source_id` AND NEW.`idempotency_key` IS OLD.`idempotency_key` AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_stock_movements'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_postings_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `finance_postings_append_only_delete` BEFORE DELETE ON `finance_postings` BEGIN SELECT RAISE(ABORT, 'append-only: finance_postings'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_postings_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `finance_postings_append_only_update` BEFORE UPDATE ON `finance_postings` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`idempotency_key` IS OLD.`idempotency_key` AND NEW.`source_module` IS OLD.`source_module` AND NEW.`source_type` IS OLD.`source_type` AND NEW.`source_id` IS OLD.`source_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`reverses_id` IS OLD.`reverses_id` AND NEW.`period_id` IS OLD.`period_id` AND NEW.`occurred_at` IS OLD.`occurred_at` AND NEW.`posted_at` IS OLD.`posted_at` AND NEW.`posted_by` IS OLD.`posted_by`) BEGIN SELECT RAISE(ABORT, 'append-only: finance_postings'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_entries_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `finance_entries_append_only_delete` BEFORE DELETE ON `finance_entries` BEGIN SELECT RAISE(ABORT, 'append-only: finance_entries'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_entries_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `finance_entries_append_only_update` BEFORE UPDATE ON `finance_entries` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`posting_id` IS OLD.`posting_id` AND NEW.`account_id` IS OLD.`account_id` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`currency` IS OLD.`currency` AND NEW.`for_module` IS OLD.`for_module` AND NEW.`production_id` IS OLD.`production_id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`tax_code` IS OLD.`tax_code` AND NEW.`tax_minor` IS OLD.`tax_minor` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: finance_entries'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_seals_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `finance_seals_append_only_delete` BEFORE DELETE ON `finance_seals` BEGIN SELECT RAISE(ABORT, 'append-only: finance_seals'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_seals_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `finance_seals_append_only_update` BEFORE UPDATE ON `finance_seals` WHEN NOT (NEW.`posting_id` IS OLD.`posting_id` AND NEW.`entry_count` IS OLD.`entry_count` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: finance_seals'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_period_closes_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `finance_period_closes_append_only_delete` BEFORE DELETE ON `finance_period_closes` BEGIN SELECT RAISE(ABORT, 'append-only: finance_period_closes'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `finance_period_closes_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `finance_period_closes_append_only_update` BEFORE UPDATE ON `finance_period_closes` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`period_id` IS OLD.`period_id` AND NEW.`action` IS OLD.`action` AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at` AND NEW.`debits_minor` IS OLD.`debits_minor` AND NEW.`credits_minor` IS OLD.`credits_minor` AND NEW.`reason_term_id` IS OLD.`reason_term_id`) BEGIN SELECT RAISE(ABORT, 'append-only: finance_period_closes'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `front_of_house_night_report_notes_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `front_of_house_night_report_notes_append_only_delete` BEFORE DELETE ON `front_of_house_night_report_notes` BEGIN SELECT RAISE(ABORT, 'append-only: front_of_house_night_report_notes'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `front_of_house_night_report_notes_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `front_of_house_night_report_notes_append_only_update` BEFORE UPDATE ON `front_of_house_night_report_notes` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`report_id` IS OLD.`report_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`topic` IS OLD.`topic` AND NEW.`body` IS OLD.`body` AND NEW.`author_id` IS OLD.`author_id` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: front_of_house_night_report_notes'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `front_of_house_incident_updates_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `front_of_house_incident_updates_append_only_delete` BEFORE DELETE ON `front_of_house_incident_updates` BEGIN SELECT RAISE(ABORT, 'append-only: front_of_house_incident_updates'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `front_of_house_incident_updates_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `front_of_house_incident_updates_append_only_update` BEFORE UPDATE ON `front_of_house_incident_updates` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`incident_id` IS OLD.`incident_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`from_value` IS OLD.`from_value` AND NEW.`to_value` IS OLD.`to_value` AND (NEW.`body` IS OLD.`body` OR NEW.`body` IS NULL) AND NEW.`author_id` IS OLD.`author_id` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: front_of_house_incident_updates'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_prices_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `box_office_prices_append_only_delete` BEFORE DELETE ON `box_office_prices` BEGIN SELECT RAISE(ABORT, 'append-only: box_office_prices'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_prices_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `box_office_prices_append_only_update` BEFORE UPDATE ON `box_office_prices` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`production_id` IS OLD.`production_id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`band_id` IS OLD.`band_id` AND NEW.`ticket_type_id` IS OLD.`ticket_type_id` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`inherits` IS OLD.`inherits` AND NEW.`currency` IS OLD.`currency` AND NEW.`effective_from` IS OLD.`effective_from` AND NEW.`set_by` IS OLD.`set_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: box_office_prices'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_scans_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `box_office_scans_append_only_delete` BEFORE DELETE ON `box_office_scans` BEGIN SELECT RAISE(ABORT, 'append-only: box_office_scans'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_scans_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `box_office_scans_append_only_update` BEFORE UPDATE ON `box_office_scans` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`ticket_id` IS OLD.`ticket_id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`result` IS OLD.`result` AND NEW.`reason_term_id` IS OLD.`reason_term_id` AND NEW.`unchecked` IS OLD.`unchecked` AND NEW.`scanned_by` IS OLD.`scanned_by` AND NEW.`device_label` IS OLD.`device_label` AND NEW.`scanned_at` IS OLD.`scanned_at` AND NEW.`received_at` IS OLD.`received_at` AND NEW.`offline` IS OLD.`offline`) BEGIN SELECT RAISE(ABORT, 'append-only: box_office_scans'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_cancellations_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `box_office_cancellations_append_only_delete` BEFORE DELETE ON `box_office_cancellations` BEGIN SELECT RAISE(ABORT, 'append-only: box_office_cancellations'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_cancellations_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `box_office_cancellations_append_only_update` BEFORE UPDATE ON `box_office_cancellations` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`order_id` IS OLD.`order_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`reason_term_id` IS OLD.`reason_term_id` AND (NEW.`note` IS OLD.`note` OR NEW.`note` IS '[removed]') AND NEW.`line_ids` IS OLD.`line_ids` AND NEW.`refund_id` IS OLD.`refund_id` AND NEW.`fee_minor` IS OLD.`fee_minor` AND NEW.`by` IS OLD.`by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: box_office_cancellations'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `membership_fees_prices_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `membership_fees_prices_append_only_delete` BEFORE DELETE ON `membership_fees_prices` BEGIN SELECT RAISE(ABORT, 'append-only: membership_fees_prices'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `membership_fees_prices_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `membership_fees_prices_append_only_update` BEFORE UPDATE ON `membership_fees_prices` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`scheme_id` IS OLD.`scheme_id` AND NEW.`length_option_id` IS OLD.`length_option_id` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`currency` IS OLD.`currency` AND NEW.`tax_code` IS OLD.`tax_code` AND NEW.`applies_to` IS OLD.`applies_to` AND NEW.`from_date` IS OLD.`from_date` AND NEW.`set_by` IS OLD.`set_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: membership_fees_prices'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `payments_attempt_events_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `payments_attempt_events_append_only_delete` BEFORE DELETE ON `payments_attempt_events` BEGIN SELECT RAISE(ABORT, 'append-only: payments_attempt_events'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `payments_attempt_events_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `payments_attempt_events_append_only_update` BEFORE UPDATE ON `payments_attempt_events` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`attempt_id` IS OLD.`attempt_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`source` IS OLD.`source` AND NEW.`webhook_event_id` IS OLD.`webhook_event_id` AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at`) BEGIN SELECT RAISE(ABORT, 'append-only: payments_attempt_events'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_setting_changes_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_setting_changes_append_only_delete` BEFORE DELETE ON `core_setting_changes` BEGIN SELECT RAISE(ABORT, 'append-only: core_setting_changes'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_setting_changes_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_setting_changes_append_only_update` BEFORE UPDATE ON `core_setting_changes` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`key` IS OLD.`key` AND NEW.`old_value` IS OLD.`old_value` AND NEW.`new_value` IS OLD.`new_value` AND (NEW.`reason` IS OLD.`reason` OR NEW.`reason` IS '[removed]') AND NEW.`at` IS OLD.`at` AND NEW.`actor` IS OLD.`actor`) BEGIN SELECT RAISE(ABORT, 'append-only: core_setting_changes'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_migrations_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_migrations_append_only_delete` BEFORE DELETE ON `core_migrations` BEGIN SELECT RAISE(ABORT, 'append-only: core_migrations'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_migrations_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_migrations_append_only_update` BEFORE UPDATE ON `core_migrations` WHEN NOT (NEW.`owner` IS OLD.`owner` AND NEW.`name` IS OLD.`name` AND NEW.`checksum` IS OLD.`checksum` AND NEW.`applied_at` IS OLD.`applied_at` AND NEW.`duration_ms` IS OLD.`duration_ms` AND NEW.`release` IS OLD.`release`) BEGIN SELECT RAISE(ABORT, 'append-only: core_migrations'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_external_calls_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_external_calls_append_only_delete` BEFORE DELETE ON `core_external_calls` BEGIN SELECT RAISE(ABORT, 'append-only: core_external_calls'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_external_calls_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_external_calls_append_only_update` BEFORE UPDATE ON `core_external_calls` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`module_id` IS OLD.`module_id` AND NEW.`purpose` IS OLD.`purpose` AND NEW.`reference` IS OLD.`reference` AND NEW.`idempotency_key` IS OLD.`idempotency_key` AND NEW.`phase` IS OLD.`phase` AND NEW.`result` IS OLD.`result` AND NEW.`provider_reference` IS OLD.`provider_reference` AND NEW.`at` IS OLD.`at`) BEGIN SELECT RAISE(ABORT, 'append-only: core_external_calls'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_audit_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_audit_append_only_delete` BEFORE DELETE ON `core_audit` BEGIN SELECT RAISE(ABORT, 'append-only: core_audit'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_audit_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_audit_append_only_update` BEFORE UPDATE ON `core_audit` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`at` IS OLD.`at` AND NEW.`actor_account_id` IS OLD.`actor_account_id` AND (NEW.`actor_name` IS OLD.`actor_name` OR NEW.`actor_name` IS 'Former member') AND NEW.`actor_kind` IS OLD.`actor_kind` AND NEW.`action` IS OLD.`action` AND NEW.`ability` IS OLD.`ability` AND NEW.`allowed_by` IS OLD.`allowed_by` AND NEW.`module_id` IS OLD.`module_id` AND NEW.`record_type` IS OLD.`record_type` AND NEW.`record_id` IS OLD.`record_id` AND NEW.`detail` IS OLD.`detail` AND NEW.`request_id` IS OLD.`request_id` AND NEW.`unit_id` IS OLD.`unit_id`) BEGIN SELECT RAISE(ABORT, 'append-only: core_audit'); END;
--> statement-breakpoint
CREATE TRIGGER `core_guard_check` BEFORE INSERT ON `core_guard` BEGIN SELECT CASE WHEN NEW.ok = 1 THEN RAISE(IGNORE) ELSE RAISE(ABORT, 'guard:' || coalesce(NEW.code, '')) END; END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_grants_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_grants_append_only_delete` BEFORE DELETE ON `core_grants` BEGIN SELECT RAISE(ABORT, 'append-only: core_grants'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_grants_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_grants_append_only_update` BEFORE UPDATE ON `core_grants` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`account_id` IS OLD.`account_id` AND NEW.`role_id` IS OLD.`role_id` AND NEW.`scope` IS OLD.`scope` AND NEW.`scope_module` IS OLD.`scope_module` AND NEW.`scope_type` IS OLD.`scope_type` AND NEW.`scope_id` IS OLD.`scope_id` AND NEW.`starts_at` IS OLD.`starts_at` AND NEW.`expires_at` IS OLD.`expires_at` AND NEW.`granted_by` IS OLD.`granted_by` AND NEW.`granted_at` IS OLD.`granted_at`) BEGIN SELECT RAISE(ABORT, 'append-only: core_grants'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_grant_ends_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_grant_ends_append_only_delete` BEFORE DELETE ON `core_grant_ends` BEGIN SELECT RAISE(ABORT, 'append-only: core_grant_ends'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_grant_ends_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_grant_ends_append_only_update` BEFORE UPDATE ON `core_grant_ends` WHEN NOT (NEW.`grant_id` IS OLD.`grant_id` AND NEW.`ended_at` IS OLD.`ended_at` AND NEW.`ended_by` IS OLD.`ended_by` AND NEW.`ended_reason` IS OLD.`ended_reason`) BEGIN SELECT RAISE(ABORT, 'append-only: core_grant_ends'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_production_slugs_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_production_slugs_append_only_delete` BEFORE DELETE ON `core_production_slugs` BEGIN SELECT RAISE(ABORT, 'append-only: core_production_slugs'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_production_slugs_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_production_slugs_append_only_update` BEFORE UPDATE ON `core_production_slugs` WHEN NOT (NEW.`slug` IS OLD.`slug` AND NEW.`production_id` IS OLD.`production_id` AND NEW.`retired_at` IS OLD.`retired_at`) BEGIN SELECT RAISE(ABORT, 'append-only: core_production_slugs'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `forms_versions_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `forms_versions_append_only_delete` BEFORE DELETE ON `forms_versions` BEGIN SELECT RAISE(ABORT, 'append-only: forms_versions'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `forms_versions_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `forms_versions_append_only_update` BEFORE UPDATE ON `forms_versions` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`form_id` IS OLD.`form_id` AND NEW.`number` IS OLD.`number` AND NEW.`definition` IS OLD.`definition` AND NEW.`definition_hash` IS OLD.`definition_hash` AND NEW.`format` IS OLD.`format` AND NEW.`change_summary` IS OLD.`change_summary` AND NEW.`published_by` IS OLD.`published_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: forms_versions'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `forms_answers_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `forms_answers_append_only_delete` BEFORE DELETE ON `forms_answers` BEGIN SELECT RAISE(ABORT, 'append-only: forms_answers'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `forms_answers_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `forms_answers_append_only_update` BEFORE UPDATE ON `forms_answers` WHEN NOT (NEW.`response_id` IS OLD.`response_id` AND NEW.`revision` IS OLD.`revision` AND NEW.`question_id` IS OLD.`question_id` AND NEW.`repeat_index` IS OLD.`repeat_index` AND NEW.`data_class` IS OLD.`data_class` AND (NEW.`value_text` IS OLD.`value_text` OR NEW.`value_text` IS NULL OR NEW.`value_text` IN ('Former member', '[removed]')) AND (NEW.`value_number` IS OLD.`value_number` OR NEW.`value_number` IS NULL OR NEW.`value_number` IN ('Former member', '[removed]')) AND (NEW.`value_json` IS OLD.`value_json` OR NEW.`value_json` IS NULL OR NEW.`value_json` IN ('Former member', '[removed]')) AND (NEW.`other_text` IS OLD.`other_text` OR NEW.`other_text` IS NULL OR NEW.`other_text` IN ('Former member', '[removed]')) AND (NEW.`value_cipher` IS OLD.`value_cipher` OR NEW.`value_cipher` IS NULL) AND (NEW.`label_snapshot` IS OLD.`label_snapshot` OR NEW.`label_snapshot` IS NULL OR NEW.`label_snapshot` IN ('Former member', '[removed]'))) BEGIN SELECT RAISE(ABORT, 'append-only: forms_answers'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `forms_stage_history_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `forms_stage_history_append_only_delete` BEFORE DELETE ON `forms_stage_history` BEGIN SELECT RAISE(ABORT, 'append-only: forms_stage_history'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `forms_stage_history_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `forms_stage_history_append_only_update` BEFORE UPDATE ON `forms_stage_history` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`response_id` IS OLD.`response_id` AND NEW.`from_stage` IS OLD.`from_stage` AND NEW.`to_stage` IS OLD.`to_stage` AND NEW.`to_kind` IS OLD.`to_kind` AND NEW.`transition_key` IS OLD.`transition_key` AND NEW.`revision` IS OLD.`revision` AND NEW.`actor_id` IS OLD.`actor_id` AND NEW.`at` IS OLD.`at`) BEGIN SELECT RAISE(ABORT, 'append-only: forms_stage_history'); END;
--> statement-breakpoint
-- search-index: core_account_emails address
DROP TRIGGER IF EXISTS `core_account_emails_search_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_account_emails_search_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_account_emails_search_update`;
--> statement-breakpoint
DROP TABLE IF EXISTS `core_account_emails_search`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `core_account_emails_search` USING fts5(`address`, content='core_account_emails', content_rowid='rowid', tokenize='trigram remove_diacritics 1');
--> statement-breakpoint
INSERT INTO `core_account_emails_search` (`core_account_emails_search`, rank) VALUES ('secure-delete', 1);
--> statement-breakpoint
CREATE TRIGGER `core_account_emails_search_insert` AFTER INSERT ON `core_account_emails` BEGIN INSERT INTO `core_account_emails_search` (rowid, `address`) VALUES (new.rowid, new.`address`); END;
--> statement-breakpoint
CREATE TRIGGER `core_account_emails_search_delete` AFTER DELETE ON `core_account_emails` BEGIN INSERT INTO `core_account_emails_search` (`core_account_emails_search`, rowid, `address`) VALUES ('delete', old.rowid, old.`address`); END;
--> statement-breakpoint
CREATE TRIGGER `core_account_emails_search_update` AFTER UPDATE OF `address` ON `core_account_emails` BEGIN INSERT INTO `core_account_emails_search` (`core_account_emails_search`, rowid, `address`) VALUES ('delete', old.rowid, old.`address`); INSERT INTO `core_account_emails_search` (rowid, `address`) VALUES (new.rowid, new.`address`); END;
--> statement-breakpoint
INSERT INTO `core_account_emails_search` (`core_account_emails_search`) VALUES ('rebuild');
--> statement-breakpoint
-- search-index: core_accounts name,preferred_name
DROP TRIGGER IF EXISTS `core_accounts_search_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_accounts_search_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_accounts_search_update`;
--> statement-breakpoint
DROP TABLE IF EXISTS `core_accounts_search`;
--> statement-breakpoint
CREATE VIRTUAL TABLE `core_accounts_search` USING fts5(`name`, `preferred_name`, content='core_accounts', content_rowid='rowid', tokenize='trigram remove_diacritics 1');
--> statement-breakpoint
INSERT INTO `core_accounts_search` (`core_accounts_search`, rank) VALUES ('secure-delete', 1);
--> statement-breakpoint
CREATE TRIGGER `core_accounts_search_insert` AFTER INSERT ON `core_accounts` BEGIN INSERT INTO `core_accounts_search` (rowid, `name`, `preferred_name`) VALUES (new.rowid, new.`name`, new.`preferred_name`); END;
--> statement-breakpoint
CREATE TRIGGER `core_accounts_search_delete` AFTER DELETE ON `core_accounts` BEGIN INSERT INTO `core_accounts_search` (`core_accounts_search`, rowid, `name`, `preferred_name`) VALUES ('delete', old.rowid, old.`name`, old.`preferred_name`); END;
--> statement-breakpoint
CREATE TRIGGER `core_accounts_search_update` AFTER UPDATE OF `name`, `preferred_name` ON `core_accounts` BEGIN INSERT INTO `core_accounts_search` (`core_accounts_search`, rowid, `name`, `preferred_name`) VALUES ('delete', old.rowid, old.`name`, old.`preferred_name`); INSERT INTO `core_accounts_search` (rowid, `name`, `preferred_name`) VALUES (new.rowid, new.`name`, new.`preferred_name`); END;
--> statement-breakpoint
INSERT INTO `core_accounts_search` (`core_accounts_search`) VALUES ('rebuild');
--> statement-breakpoint
-- Written by hand, not by Drizzle Kit: each module's life-cycle and counter triggers, carried over from the migrations this baseline replaced.
CREATE TRIGGER `bar_openings_closed_final` BEFORE UPDATE ON `bar_openings` WHEN OLD.`state` = 'closed' BEGIN SELECT RAISE(ABORT, 'bar: a closed opening is final'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_lines_total_delete` AFTER DELETE ON `bar_sale_lines` BEGIN UPDATE `bar_sales` SET `total_minor` = `total_minor` - OLD.`amount_minor` WHERE `id` = OLD.`sale_id`; END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_lines_total_insert` AFTER INSERT ON `bar_sale_lines` BEGIN UPDATE `bar_sales` SET `total_minor` = `total_minor` + NEW.`amount_minor` WHERE `id` = NEW.`sale_id`; END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_lines_total_update` AFTER UPDATE OF `amount_minor` ON `bar_sale_lines` BEGIN UPDATE `bar_sales` SET `total_minor` = `total_minor` - OLD.`amount_minor` + NEW.`amount_minor` WHERE `id` = NEW.`sale_id`; END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_lines_while_open_delete` BEFORE DELETE ON `bar_sale_lines` WHEN NOT EXISTS (SELECT 1 FROM `bar_sales` WHERE `id` = OLD.`sale_id` AND `state` = 'open') BEGIN SELECT RAISE(ABORT, 'bar: lines change only while the sale is open'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_lines_while_open_insert` BEFORE INSERT ON `bar_sale_lines` WHEN NOT EXISTS (SELECT 1 FROM `bar_sales` WHERE `id` = NEW.`sale_id` AND `state` = 'open') BEGIN SELECT RAISE(ABORT, 'bar: lines change only while the sale is open'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_lines_while_open_update` BEFORE UPDATE ON `bar_sale_lines` WHEN NOT EXISTS (SELECT 1 FROM `bar_sales` WHERE `id` = OLD.`sale_id` AND `state` = 'open') OR NEW.`sale_id` <> OLD.`sale_id` BEGIN SELECT RAISE(ABORT, 'bar: lines change only while the sale is open'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_reversals_fixed` BEFORE UPDATE ON `bar_sale_reversals` WHEN NEW.`sale_line_id` <> OLD.`sale_line_id` OR NEW.`refund_id` <> OLD.`refund_id` OR NEW.`quantity` <> OLD.`quantity` OR NEW.`amount_minor` <> OLD.`amount_minor` OR NEW.`reason_term` <> OLD.`reason_term` OR NEW.`stock_outcome` <> OLD.`stock_outcome` OR (NEW.`state` <> OLD.`state` AND NOT (OLD.`state` = 'requested' AND NEW.`state` IN ('succeeded', 'failed'))) BEGIN SELECT RAISE(ABORT, 'bar: a reversal only moves from requested to succeeded or failed'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_reversals_kept` BEFORE DELETE ON `bar_sale_reversals` BEGIN SELECT RAISE(ABORT, 'bar: a reversal is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_reversals_paid_line` BEFORE INSERT ON `bar_sale_reversals` WHEN NEW.`state` <> 'requested' OR NOT EXISTS (SELECT 1 FROM `bar_sale_lines` l JOIN `bar_sales` s ON s.`id` = l.`sale_id` WHERE l.`id` = NEW.`sale_line_id` AND s.`state` = 'paid') BEGIN SELECT RAISE(ABORT, 'bar: only a paid line is refunded, and a refund starts requested'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_reversals_within_line` BEFORE INSERT ON `bar_sale_reversals` WHEN (SELECT l.`quantity` - coalesce((SELECT sum(r.`quantity`) FROM `bar_sale_reversals` r WHERE r.`sale_line_id` = l.`id` AND r.`state` <> 'failed'), 0) FROM `bar_sale_lines` l WHERE l.`id` = NEW.`sale_line_id`) < NEW.`quantity` OR (SELECT l.`amount_minor` - coalesce((SELECT sum(r.`amount_minor`) FROM `bar_sale_reversals` r WHERE r.`sale_line_id` = l.`id` AND r.`state` <> 'failed'), 0) FROM `bar_sale_lines` l WHERE l.`id` = NEW.`sale_line_id`) < NEW.`amount_minor` BEGIN SELECT RAISE(ABORT, 'bar: a refund cannot pass what was sold on the line'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sales_insert` BEFORE INSERT ON `bar_sales` WHEN NEW.`state` <> 'open' OR NEW.`total_minor` <> 0 BEGIN SELECT RAISE(ABORT, 'bar: a bar sale starts open and empty'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sales_life` BEFORE UPDATE ON `bar_sales` WHEN (OLD.`state` IN ('paid', 'void') AND NOT (NEW.`state` IS OLD.`state` AND NEW.`total_minor` IS OLD.`total_minor` AND NEW.`intent_id` IS OLD.`intent_id` AND NEW.`paid_at` IS OLD.`paid_at`)) OR (NEW.`state` <> OLD.`state` AND NOT ((OLD.`state` = 'open' AND NEW.`state` IN ('awaiting_payment', 'void', 'paid')) OR (OLD.`state` = 'awaiting_payment' AND NEW.`state` IN ('open', 'paid')))) OR (OLD.`state` = 'open' AND NEW.`state` IN ('awaiting_payment', 'paid') AND NOT EXISTS (SELECT 1 FROM `bar_sale_lines` WHERE `sale_id` = NEW.`id`)) OR (OLD.`state` <> 'open' AND NEW.`total_minor` <> OLD.`total_minor`) OR NEW.`opening_id` <> OLD.`opening_id` BEGIN SELECT RAISE(ABORT, 'bar: a bar sale moves only along its life cycle'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sales_open_opening` BEFORE INSERT ON `bar_sales` WHEN NOT EXISTS (SELECT 1 FROM `bar_openings` WHERE `id` = NEW.`opening_id` AND `state` = 'open') BEGIN SELECT RAISE(ABORT, 'bar: a bar sale is made in an open opening'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_levels_delete` BEFORE DELETE ON `bar_stock_levels` BEGIN SELECT RAISE(ABORT, 'bar: a stock level changes only by a movement'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_levels_from_movements` BEFORE UPDATE OF `quantity`, `stock_item_id`, `location_id` ON `bar_stock_levels` WHEN NEW.`stock_item_id` IS NOT OLD.`stock_item_id` OR NEW.`location_id` IS NOT OLD.`location_id` OR NEW.`quantity` IS NOT (SELECT coalesce(sum(`quantity`), 0) FROM `bar_stock_movements` WHERE `stock_item_id` = NEW.`stock_item_id` AND `location_id` = NEW.`location_id`) BEGIN SELECT RAISE(ABORT, 'bar: a stock level changes only by a movement'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_levels_insert` BEFORE INSERT ON `bar_stock_levels` WHEN NEW.`quantity` <> 0 BEGIN SELECT RAISE(ABORT, 'bar: a stock level changes only by a movement'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_stock_movements_level` AFTER INSERT ON `bar_stock_movements` BEGIN INSERT OR IGNORE INTO `bar_stock_levels` (`stock_item_id`, `location_id`, `quantity`) VALUES (NEW.`stock_item_id`, NEW.`location_id`, 0); UPDATE `bar_stock_levels` SET `quantity` = `quantity` + NEW.`quantity` WHERE `stock_item_id` = NEW.`stock_item_id` AND `location_id` = NEW.`location_id`; END;
--> statement-breakpoint
CREATE TRIGGER `box_office_claims_count_insert` AFTER INSERT ON `box_office_claims` BEGIN UPDATE `box_office_pools` SET `claimed` = `claimed` + 1 WHERE `id` = NEW.`pool_id`; END;
--> statement-breakpoint
CREATE TRIGGER `box_office_claims_count_release` AFTER UPDATE OF `state` ON `box_office_claims` WHEN OLD.`state` IN ('held', 'confirmed') AND NEW.`state` = 'released' BEGIN UPDATE `box_office_pools` SET `claimed` = `claimed` - 1 WHERE `id` = OLD.`pool_id`; END;
--> statement-breakpoint
CREATE TRIGGER `box_office_claims_displaced_follow` AFTER UPDATE OF `state`, `expires_at` ON `box_office_claims` WHEN NEW.`displaced_for_id` IS NULL AND (NEW.`state` <> OLD.`state` OR NEW.`expires_at` IS NOT OLD.`expires_at`) BEGIN UPDATE `box_office_claims` SET `state` = NEW.`state`, `expires_at` = NEW.`expires_at`, `released_at` = NEW.`released_at`, `release_reason` = NEW.`release_reason` WHERE `displaced_for_id` = NEW.`id` AND `state` <> 'released' AND (`state` <> NEW.`state` OR `expires_at` IS NOT NEW.`expires_at`); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_claims_fixed` BEFORE UPDATE ON `box_office_claims` WHEN NEW.`pool_id` <> OLD.`pool_id` OR NEW.`seat_id` IS NOT OLD.`seat_id` OR NEW.`displaced_for_id` IS NOT OLD.`displaced_for_id` OR (NEW.`state` <> OLD.`state` AND NOT ((OLD.`state` = 'held' AND NEW.`state` IN ('confirmed', 'released')) OR (OLD.`state` = 'confirmed' AND NEW.`state` = 'released'))) BEGIN SELECT RAISE(ABORT, 'box-office: a claim keeps its pool and seat, and released is final'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_claims_insert` BEFORE INSERT ON `box_office_claims` WHEN NEW.`state` NOT IN ('held', 'confirmed') BEGIN SELECT RAISE(ABORT, 'box-office: a claim starts held or confirmed'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_claims_no_delete` BEFORE DELETE ON `box_office_claims` BEGIN SELECT RAISE(ABORT, 'box-office: a claim is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_claims_release_pass` AFTER UPDATE OF `state` ON `box_office_claims` WHEN OLD.`state` IN ('held', 'confirmed') AND NEW.`state` = 'released' BEGIN UPDATE `box_office_pass_redemptions` SET `state` = 'released', `updated_at` = coalesce(NEW.`released_at`, `updated_at`) WHERE `claim_id` = NEW.`id` AND `state` = 'live'; END;
--> statement-breakpoint
CREATE TRIGGER `box_office_order_lines_fixed` BEFORE UPDATE ON `box_office_order_lines` WHEN NEW.`order_id` <> OLD.`order_id` OR NEW.`kind` <> OLD.`kind` OR NEW.`claim_id` IS NOT OLD.`claim_id` OR (NEW.`state` <> OLD.`state` AND OLD.`state` <> 'live') BEGIN SELECT RAISE(ABORT, 'box-office: a line keeps its order and claim, and a cancelled line stays cancelled'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_orders_confirming` BEFORE UPDATE ON `box_office_orders` WHEN NOT ((NEW.`confirm_token_hash` IS NULL AND NEW.`confirm_email` IS NULL AND NEW.`confirm_name` IS NULL AND NEW.`confirm_expires_at` IS NULL) OR (NEW.`state` = 'basket' AND NEW.`confirm_token_hash` IS NOT NULL AND NEW.`confirm_email` IS NOT NULL AND NEW.`confirm_expires_at` IS NOT NULL AND NEW.`confirm_expires_at` <= NEW.`expires_at`)) BEGIN SELECT RAISE(ABORT, 'box-office: only a basket waits for its address to be confirmed'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_orders_fixed` BEFORE UPDATE ON `box_office_orders` WHEN NEW.`reference` <> OLD.`reference` OR NEW.`channel` <> OLD.`channel` OR NEW.`currency` <> OLD.`currency` OR (NEW.`state` <> OLD.`state` AND NOT ((OLD.`state` = 'basket' AND NEW.`state` IN ('awaiting_payment', 'confirmed', 'reserved', 'expired')) OR (OLD.`state` = 'awaiting_payment' AND NEW.`state` IN ('confirmed', 'reserved', 'expired', 'cancelled')) OR (OLD.`state` = 'reserved' AND NEW.`state` IN ('awaiting_payment', 'confirmed', 'cancelled', 'expired')) OR (OLD.`state` = 'expired' AND NEW.`state` = 'reserved' AND OLD.`reserved_at` IS NOT NULL) OR (OLD.`state` = 'confirmed' AND NEW.`state` = 'cancelled'))) BEGIN SELECT RAISE(ABORT, 'box-office: an order moves only along its life cycle'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_orders_insert` BEFORE INSERT ON `box_office_orders` WHEN NEW.`state` <> 'basket' BEGIN SELECT RAISE(ABORT, 'box-office: an order starts as a basket'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_orders_no_delete` BEFORE DELETE ON `box_office_orders` WHEN OLD.`state` NOT IN ('basket', 'expired') BEGIN SELECT RAISE(ABORT, 'box-office: an order that was reserved or sold is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pass_redemptions_count_insert` AFTER INSERT ON `box_office_pass_redemptions` BEGIN UPDATE `box_office_passes` SET `uses_taken` = `uses_taken` + 1 WHERE `id` = NEW.`pass_id`; END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pass_redemptions_count_release` AFTER UPDATE OF `state` ON `box_office_pass_redemptions` WHEN OLD.`state` = 'live' AND NEW.`state` = 'released' BEGIN UPDATE `box_office_passes` SET `uses_taken` = `uses_taken` - 1 WHERE `id` = OLD.`pass_id`; END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pass_redemptions_fixed` BEFORE UPDATE ON `box_office_pass_redemptions` WHEN NEW.`pass_id` <> OLD.`pass_id` OR NEW.`claim_id` <> OLD.`claim_id` OR NEW.`performance_id` <> OLD.`performance_id` OR NEW.`production_id` <> OLD.`production_id` OR (NEW.`state` <> OLD.`state` AND OLD.`state` = 'released') BEGIN SELECT RAISE(ABORT, 'box-office: a pass entry keeps its pass, performance and seat, and released is final'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pass_redemptions_insert` BEFORE INSERT ON `box_office_pass_redemptions` WHEN NEW.`state` <> 'live' BEGIN SELECT RAISE(ABORT, 'box-office: a pass entry starts live'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pass_redemptions_no_delete` BEFORE DELETE ON `box_office_pass_redemptions` BEGIN SELECT RAISE(ABORT, 'box-office: a pass entry is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_passes_uses_taken` BEFORE UPDATE ON `box_office_passes` WHEN NEW.`uses_taken` <> OLD.`uses_taken` AND NEW.`uses_taken` <> (SELECT count(*) FROM `box_office_pass_redemptions` WHERE `pass_id` = NEW.`id` AND `state` = 'live') BEGIN SELECT RAISE(ABORT, 'box-office: a pass''s entries taken are its live redemptions'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pools_fixed` BEFORE UPDATE ON `box_office_pools` WHEN NEW.`performance_id` <> OLD.`performance_id` OR NEW.`band_id` <> OLD.`band_id` OR (NEW.`claimed` <> OLD.`claimed` AND NEW.`claimed` <> (SELECT count(*) FROM `box_office_claims` WHERE `pool_id` = NEW.`id` AND `state` IN ('held', 'confirmed'))) BEGIN SELECT RAISE(ABORT, 'box-office: a pool keeps its band, and its counter is its live claims'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pools_insert` BEFORE INSERT ON `box_office_pools` WHEN NEW.`claimed` <> 0 BEGIN SELECT RAISE(ABORT, 'box-office: a pool starts with nothing claimed'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pools_no_delete` BEFORE DELETE ON `box_office_pools` WHEN EXISTS (SELECT 1 FROM `box_office_claims` WHERE `pool_id` = OLD.`id`) BEGIN SELECT RAISE(ABORT, 'box-office: a pool with claims is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_tickets_fixed` BEFORE UPDATE ON `box_office_tickets` WHEN NEW.`order_line_id` <> OLD.`order_line_id` OR NEW.`performance_id` <> OLD.`performance_id` OR NEW.`code_hash` <> OLD.`code_hash` OR NEW.`key_id` <> OLD.`key_id` OR (OLD.`state` = 'void' AND NEW.`state` <> 'void') OR (NEW.`admitted_at` IS NOT NULL AND OLD.`admitted_at` IS NULL AND OLD.`state` <> 'valid') BEGIN SELECT RAISE(ABORT, 'box-office: a ticket keeps its code, void is final, and only a valid ticket is admitted'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_tickets_no_delete` BEFORE DELETE ON `box_office_tickets` BEGIN SELECT RAISE(ABORT, 'box-office: a ticket is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `core_accounts_never_deleted` BEFORE DELETE ON `core_accounts` BEGIN SELECT RAISE(ABORT, 'identity: an account is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `core_accounts_tombstone` BEFORE UPDATE ON `core_accounts` WHEN OLD.`anonymised_at` IS NOT NULL AND (NEW.`anonymised_at` IS NULL OR NEW.`name` IS NOT NULL OR NEW.`preferred_name` IS NOT NULL OR NEW.`pronouns` IS NOT NULL OR NEW.`phone` IS NOT NULL OR NEW.`last_signed_in_at` IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'identity: nothing personal is written to an erased account'); END;
--> statement-breakpoint
CREATE TRIGGER `core_grants_not_to_oneself` BEFORE INSERT ON `core_grants` WHEN NEW.`granted_by` IS NEW.`account_id` AND EXISTS (SELECT 1 FROM `core_grants`) BEGIN SELECT RAISE(ABORT, 'identity: nobody grants themselves a role'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_entries_account_module` BEFORE INSERT ON `finance_entries` WHEN NOT EXISTS (SELECT 1 FROM `finance_postings` p JOIN `finance_accounts` a ON a.`id` = NEW.`account_id` WHERE p.`id` = NEW.`posting_id` AND (NEW.`for_module` IS NULL OR NEW.`for_module` = p.`source_module` OR p.`source_module` = 'payments') AND (a.`module` = coalesce(NEW.`for_module`, p.`source_module`) OR (p.`source_module` = 'finance' AND p.`kind` IN ('correction', 'opening'))) AND (a.`active` = 1 OR p.`reverses_id` IS NOT NULL)) BEGIN SELECT RAISE(ABORT, 'finance: a module posts only to its own active accounts'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_entries_after_seal` BEFORE INSERT ON `finance_entries` WHEN EXISTS (SELECT 1 FROM `finance_seals` WHERE `posting_id` = NEW.`posting_id`) BEGIN SELECT RAISE(ABORT, 'finance: a sealed posting takes no more entries'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_period_closes_order` BEFORE INSERT ON `finance_period_closes` WHEN (NEW.`action` = 'close') = (coalesce((SELECT `action` FROM `finance_period_closes` WHERE `period_id` = NEW.`period_id` ORDER BY `at` DESC, `id` DESC LIMIT 1), 'reopen') = 'close') OR (NEW.`action` = 'close' AND (NEW.`debits_minor` <> NEW.`credits_minor` OR EXISTS (SELECT 1 FROM `finance_periods` e WHERE e.`starts_on` < (SELECT `starts_on` FROM `finance_periods` WHERE `id` = NEW.`period_id`) AND coalesce((SELECT `action` FROM `finance_period_closes` c WHERE c.`period_id` = e.`id` ORDER BY c.`at` DESC, c.`id` DESC LIMIT 1), 'reopen') <> 'close'))) BEGIN SELECT RAISE(ABORT, 'finance: a period closes after every earlier period, with debits equal to credits, and reopens only once closed'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_postings_open_period` BEFORE INSERT ON `finance_postings` WHEN coalesce((SELECT `action` FROM `finance_period_closes` WHERE `period_id` = NEW.`period_id` ORDER BY `at` DESC, `id` DESC LIMIT 1), 'reopen') = 'close' BEGIN SELECT RAISE(ABORT, 'finance: nothing is posted into a closed period'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_seals_balance` BEFORE INSERT ON `finance_seals` WHEN (SELECT count(*) FROM `finance_entries` WHERE `posting_id` = NEW.`posting_id`) <> NEW.`entry_count` OR (SELECT coalesce(sum(`amount_minor`), 0) FROM `finance_entries` WHERE `posting_id` = NEW.`posting_id`) <> 0 OR (SELECT count(DISTINCT `currency`) FROM `finance_entries` WHERE `posting_id` = NEW.`posting_id`) <> 1 BEGIN SELECT RAISE(ABORT, 'finance: a posting must balance to zero in one currency, with every entry counted, before it is sealed'); END;
--> statement-breakpoint
CREATE TRIGGER `front_of_house_night_reports_signed_delete` BEFORE DELETE ON `front_of_house_night_reports` WHEN OLD.`state` = 'signed_off' BEGIN SELECT RAISE(ABORT, 'front-of-house: a signed-off night report cannot change'); END;
--> statement-breakpoint
CREATE TRIGGER `front_of_house_night_reports_signed_update` BEFORE UPDATE ON `front_of_house_night_reports` WHEN OLD.`state` = 'signed_off' AND NOT (NEW.`id` IS OLD.`id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`state` IS OLD.`state` AND NEW.`snapshot` IS OLD.`snapshot` AND NEW.`snapshot_version` IS OLD.`snapshot_version` AND NEW.`signed_off_by` IS OLD.`signed_off_by` AND NEW.`signed_off_at` IS OLD.`signed_off_at` AND NEW.`created_at` IS OLD.`created_at` AND NEW.`updated_at` IS OLD.`updated_at`) BEGIN SELECT RAISE(ABORT, 'front-of-house: a signed-off night report cannot change'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_attempts_fixed` BEFORE UPDATE ON `payments_attempts` WHEN NEW.`intent_id` <> OLD.`intent_id` OR NEW.`provider_account_id` <> OLD.`provider_account_id` OR NEW.`method` <> OLD.`method` OR NEW.`amount_minor` <> OLD.`amount_minor` OR NEW.`idempotency_key` <> OLD.`idempotency_key` OR (NEW.`state` <> OLD.`state` AND NOT ((OLD.`state` = 'started' AND NEW.`state` IN ('pending', 'succeeded', 'failed', 'cancelled', 'unknown')) OR (OLD.`state` = 'pending' AND NEW.`state` IN ('succeeded', 'failed', 'cancelled', 'unknown')) OR (OLD.`state` = 'unknown' AND NEW.`state` IN ('succeeded', 'failed')))) BEGIN SELECT RAISE(ABORT, 'payments: an attempt keeps its amount and moves only forward'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_attempts_insert` BEFORE INSERT ON `payments_attempts` WHEN NEW.`state` <> 'started' OR NEW.`refunded_minor` <> 0 OR coalesce((SELECT `state` FROM `payments_intents` WHERE `id` = NEW.`intent_id`), '') <> 'open' BEGIN SELECT RAISE(ABORT, 'payments: an attempt starts, on an open intent'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_attempts_no_delete` BEFORE DELETE ON `payments_attempts` BEGIN SELECT RAISE(ABORT, 'payments: an attempt is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_attempts_within_intent` AFTER UPDATE OF `state` ON `payments_attempts` WHEN NEW.`state` = 'succeeded' AND (SELECT sum(`amount_minor`) FROM `payments_attempts` WHERE `intent_id` = NEW.`intent_id` AND `state` = 'succeeded') > (SELECT `amount_minor` FROM `payments_intents` WHERE `id` = NEW.`intent_id`) BEGIN SELECT RAISE(ABORT, 'payments: more was taken than the intent asks for'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_intent_parts_fixed` BEFORE UPDATE ON `payments_intent_parts` WHEN NEW.`intent_id` <> OLD.`intent_id` OR NEW.`owner_module` <> OLD.`owner_module` OR NEW.`owner_record` <> OLD.`owner_record` OR NEW.`amount_minor` <> OLD.`amount_minor` OR (NEW.`open` IS NOT OLD.`open` AND NEW.`open` IS NOT NULL) OR (OLD.`settled_at` IS NOT NULL AND NEW.`settled_at` IS NOT OLD.`settled_at`) BEGIN SELECT RAISE(ABORT, 'payments: a part keeps its owner and amount'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_intent_parts_insert` BEFORE INSERT ON `payments_intent_parts` WHEN coalesce((SELECT `state` FROM `payments_intents` WHERE `id` = NEW.`intent_id`), '') <> 'open' OR NEW.`open` IS NOT 1 OR NEW.`refunded_minor` <> 0 OR NEW.`settled_at` IS NOT NULL OR (SELECT coalesce(sum(`amount_minor`), 0) FROM `payments_intent_parts` WHERE `intent_id` = NEW.`intent_id`) + NEW.`amount_minor` > (SELECT `amount_minor` FROM `payments_intents` WHERE `id` = NEW.`intent_id`) BEGIN SELECT RAISE(ABORT, 'payments: a part joins an open intent and keeps the parts within its amount'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_intent_parts_no_delete` BEFORE DELETE ON `payments_intent_parts` BEGIN SELECT RAISE(ABORT, 'payments: a part is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_intents_clear_receipts` AFTER UPDATE OF `state` ON `payments_intents` WHEN OLD.`state` = 'open' AND NEW.`state` NOT IN ('open', 'succeeded') BEGIN UPDATE `payments_till_splits` SET `receipt_to` = NULL WHERE `intent_id` = NEW.`id`; END;
--> statement-breakpoint
CREATE TRIGGER `payments_intents_close_parts` AFTER UPDATE OF `state` ON `payments_intents` WHEN OLD.`state` = 'open' AND NEW.`state` <> 'open' BEGIN UPDATE `payments_intent_parts` SET `open` = NULL WHERE `intent_id` = NEW.`id`; END;
--> statement-breakpoint
CREATE TRIGGER `payments_intents_fixed` BEFORE UPDATE ON `payments_intents` WHEN NEW.`amount_minor` <> OLD.`amount_minor` OR NEW.`currency` <> OLD.`currency` OR NEW.`channel` <> OLD.`channel` OR (NEW.`state` <> OLD.`state` AND NOT (OLD.`state` = 'open' AND NEW.`state` IN ('succeeded', 'cancelled', 'expired', 'unfulfilled'))) BEGIN SELECT RAISE(ABORT, 'payments: an intent keeps its amount and leaves open once'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_intents_no_delete` BEFORE DELETE ON `payments_intents` BEGIN SELECT RAISE(ABORT, 'payments: an intent is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_refunds_count_approved` AFTER UPDATE OF `state` ON `payments_refunds` WHEN OLD.`state` = 'requested' AND NEW.`state` = 'approved' BEGIN UPDATE `payments_intent_parts` SET `refunded_minor` = `refunded_minor` + NEW.`amount_minor` WHERE `id` = NEW.`part_id`; UPDATE `payments_attempts` SET `refunded_minor` = `refunded_minor` + NEW.`amount_minor` WHERE `id` = NEW.`attempt_id`; END;
--> statement-breakpoint
CREATE TRIGGER `payments_refunds_count_failed` AFTER UPDATE OF `state` ON `payments_refunds` WHEN OLD.`state` IN ('approved', 'sent') AND NEW.`state` = 'failed' BEGIN UPDATE `payments_intent_parts` SET `refunded_minor` = `refunded_minor` - NEW.`amount_minor` WHERE `id` = NEW.`part_id`; UPDATE `payments_attempts` SET `refunded_minor` = `refunded_minor` - NEW.`amount_minor` WHERE `id` = NEW.`attempt_id`; END;
--> statement-breakpoint
CREATE TRIGGER `payments_refunds_count_inserted` AFTER INSERT ON `payments_refunds` WHEN NEW.`state` = 'approved' BEGIN UPDATE `payments_intent_parts` SET `refunded_minor` = `refunded_minor` + NEW.`amount_minor` WHERE `id` = NEW.`part_id`; UPDATE `payments_attempts` SET `refunded_minor` = `refunded_minor` + NEW.`amount_minor` WHERE `id` = NEW.`attempt_id`; END;
--> statement-breakpoint
CREATE TRIGGER `payments_refunds_fixed` BEFORE UPDATE ON `payments_refunds` WHEN NEW.`attempt_id` <> OLD.`attempt_id` OR NEW.`part_id` <> OLD.`part_id` OR NEW.`amount_minor` <> OLD.`amount_minor` OR NEW.`self_approve_limit_minor` <> OLD.`self_approve_limit_minor` OR NEW.`requested_by` IS NOT OLD.`requested_by` OR (NEW.`state` <> OLD.`state` AND NOT ((OLD.`state` = 'requested' AND NEW.`state` IN ('approved', 'declined')) OR (OLD.`state` = 'approved' AND NEW.`state` IN ('sent', 'succeeded', 'failed')) OR (OLD.`state` = 'sent' AND NEW.`state` IN ('succeeded', 'failed')))) BEGIN SELECT RAISE(ABORT, 'payments: a refund keeps its amount and moves only forward'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_refunds_insert` BEFORE INSERT ON `payments_refunds` WHEN NEW.`state` NOT IN ('requested', 'approved') OR NOT EXISTS (SELECT 1 FROM `payments_attempts` a JOIN `payments_intent_parts` p ON p.`intent_id` = a.`intent_id` JOIN `payments_intents` i ON i.`id` = a.`intent_id` WHERE a.`id` = NEW.`attempt_id` AND p.`id` = NEW.`part_id` AND a.`state` = 'succeeded' AND (p.`settled_at` IS NOT NULL OR i.`state` IN ('unfulfilled', 'cancelled', 'expired'))) BEGIN SELECT RAISE(ABORT, 'payments: a refund is of a settled part, or of a payment that could not be fulfilled, from a succeeded attempt on its intent'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_refunds_no_delete` BEFORE DELETE ON `payments_refunds` BEGIN SELECT RAISE(ABORT, 'payments: a refund is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `promotions_codes_used` BEFORE UPDATE ON `promotions_codes` WHEN NEW.`used` <> OLD.`used` AND NEW.`used` <> (SELECT coalesce(sum(`uses`), 0) FROM `promotions_redemptions` WHERE `code_id` = NEW.`id` AND `state` = 'live') BEGIN SELECT RAISE(ABORT, 'promotions: a code''s uses are its live redemptions'); END;
--> statement-breakpoint
CREATE TRIGGER `promotions_promotions_used` BEFORE UPDATE ON `promotions_promotions` WHEN NEW.`used` <> OLD.`used` AND NEW.`used` <> (SELECT coalesce(sum(`uses`), 0) FROM `promotions_redemptions` WHERE `promotion_id` = NEW.`id` AND `state` = 'live') BEGIN SELECT RAISE(ABORT, 'promotions: a promotion''s uses are its live redemptions'); END;
--> statement-breakpoint
CREATE TRIGGER `promotions_redemptions_count_insert` AFTER INSERT ON `promotions_redemptions` BEGIN UPDATE `promotions_promotions` SET `used` = `used` + NEW.`uses` WHERE `id` = NEW.`promotion_id`; UPDATE `promotions_codes` SET `used` = `used` + NEW.`uses` WHERE `id` = NEW.`code_id`; END;
--> statement-breakpoint
CREATE TRIGGER `promotions_redemptions_count_release` AFTER UPDATE OF `state` ON `promotions_redemptions` WHEN OLD.`state` = 'live' AND NEW.`state` = 'released' BEGIN UPDATE `promotions_promotions` SET `used` = `used` - OLD.`uses` WHERE `id` = OLD.`promotion_id`; UPDATE `promotions_codes` SET `used` = `used` - OLD.`uses` WHERE `id` = OLD.`code_id`; END;
--> statement-breakpoint
CREATE TRIGGER `promotions_redemptions_fixed` BEFORE UPDATE ON `promotions_redemptions` WHEN NEW.`promotion_id` <> OLD.`promotion_id` OR NEW.`code_id` IS NOT OLD.`code_id` OR NEW.`ref` <> OLD.`ref` OR NEW.`uses` <> OLD.`uses` OR (NEW.`state` <> OLD.`state` AND OLD.`state` = 'released') BEGIN SELECT RAISE(ABORT, 'promotions: a redemption keeps its promotion, code, line and uses, and released is final'); END;
--> statement-breakpoint
CREATE TRIGGER `promotions_redemptions_insert` BEFORE INSERT ON `promotions_redemptions` WHEN NEW.`state` <> 'live' BEGIN SELECT RAISE(ABORT, 'promotions: a redemption starts live'); END;
--> statement-breakpoint
CREATE TRIGGER `promotions_redemptions_no_delete` BEFORE DELETE ON `promotions_redemptions` BEGIN SELECT RAISE(ABORT, 'promotions: a redemption is never deleted'); END;
--> statement-breakpoint
-- The first release has one tax code, and it always exists.
INSERT INTO `finance_tax_codes` (`code`, `label`, `rate_basis_points`, `active`) VALUES ('none', 'No tax', 0, 1);

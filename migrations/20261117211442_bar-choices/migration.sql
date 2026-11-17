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
	`position` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_choice_options_group_id_bar_choice_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `bar_choice_groups`(`id`),
	CONSTRAINT "bar_choice_options_delta" CHECK("delta_minor" >= 0)
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
ALTER TABLE `bar_age_checks` ADD `id_type` text;--> statement-breakpoint
ALTER TABLE `bar_age_checks` ADD `refusal_scope` text;--> statement-breakpoint
ALTER TABLE `bar_variants` ADD `mixer_measure` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_choice_groups_name` ON `bar_choice_groups` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `bar_choice_options_name` ON `bar_choice_options` (`group_id`,lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `bar_product_choice_groups_pair` ON `bar_product_choice_groups` (`product_id`,`group_id`);--> statement-breakpoint
CREATE INDEX `bar_sale_line_choices_line` ON `bar_sale_line_choices` (`sale_line_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_variants_one_mixer` ON `bar_variants` (`product_id`) WHERE mixer_measure = 1;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_age_checks_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_age_checks_append_only_delete` BEFORE DELETE ON `bar_age_checks` BEGIN SELECT RAISE(ABORT, 'append-only: bar_age_checks'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_age_checks_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_age_checks_append_only_update` BEFORE UPDATE ON `bar_age_checks` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`opening_id` IS OLD.`opening_id` AND NEW.`sale_id` IS OLD.`sale_id` AND NEW.`outcome` IS OLD.`outcome` AND NEW.`refusal_term` IS OLD.`refusal_term` AND NEW.`variant_id` IS OLD.`variant_id` AND NEW.`basket_key` IS OLD.`basket_key` AND NEW.`id_type` IS OLD.`id_type` AND NEW.`refusal_scope` IS OLD.`refusal_scope` AND (NEW.`description` IS OLD.`description` OR NEW.`description` IS NULL) AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_age_checks'); END;

CREATE TABLE `bar_age_checks` (
	`id` text PRIMARY KEY,
	`opening_id` text NOT NULL,
	`sale_id` text,
	`outcome` text NOT NULL,
	`refusal_term` text,
	`variant_id` text,
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
CREATE INDEX `bar_age_checks_at` ON `bar_age_checks` (`at`);--> statement-breakpoint
CREATE INDEX `bar_age_checks_sale` ON `bar_age_checks` (`sale_id`);--> statement-breakpoint
CREATE INDEX `bar_register_reviews_at` ON `bar_register_reviews` (`reviewed_at`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_age_checks_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_age_checks_append_only_delete` BEFORE DELETE ON `bar_age_checks` BEGIN SELECT RAISE(ABORT, 'append-only: bar_age_checks'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_age_checks_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_age_checks_append_only_update` BEFORE UPDATE ON `bar_age_checks` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`opening_id` IS OLD.`opening_id` AND NEW.`sale_id` IS OLD.`sale_id` AND NEW.`outcome` IS OLD.`outcome` AND NEW.`refusal_term` IS OLD.`refusal_term` AND NEW.`variant_id` IS OLD.`variant_id` AND (NEW.`description` IS OLD.`description` OR NEW.`description` IS NULL) AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_age_checks'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_register_reviews_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `bar_register_reviews_append_only_delete` BEFORE DELETE ON `bar_register_reviews` BEGIN SELECT RAISE(ABORT, 'append-only: bar_register_reviews'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `bar_register_reviews_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `bar_register_reviews_append_only_update` BEFORE UPDATE ON `bar_register_reviews` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`outlet_id` IS OLD.`outlet_id` AND NEW.`from_day` IS OLD.`from_day` AND NEW.`to_day` IS OLD.`to_day` AND NEW.`refusals` IS OLD.`refusals` AND NEW.`reviewed_by` IS OLD.`reviewed_by` AND NEW.`reviewed_at` IS OLD.`reviewed_at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: bar_register_reviews'); END;

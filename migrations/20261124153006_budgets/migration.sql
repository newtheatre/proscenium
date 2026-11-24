CREATE TABLE `budgets_budgets` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`scope` text NOT NULL,
	`production_id` text,
	`season_id` text,
	`department_term_id` text,
	`year_starts_on` text NOT NULL,
	`parent_line_id` text,
	`currency` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`proposed_by` text,
	`note` text,
	`approved_by` text,
	`approved_at` integer,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_budgets_budgets_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`),
	CONSTRAINT `fk_budgets_budgets_season_id_core_seasons_id_fk` FOREIGN KEY (`season_id`) REFERENCES `core_seasons`(`id`),
	CONSTRAINT `fk_budgets_budgets_department_term_id_core_terms_id_fk` FOREIGN KEY (`department_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "budgets_budgets_name_length" CHECK(length("name") BETWEEN 1 AND 80),
	CONSTRAINT "budgets_budgets_scope" CHECK("scope" IN ('production', 'department', 'season', 'general')),
	CONSTRAINT "budgets_budgets_note" CHECK("note" IS NULL OR length("note") <= 300),
	CONSTRAINT "budgets_budgets_state" CHECK("state" IN ('draft', 'proposed', 'approved', 'closed')),
	CONSTRAINT "budgets_budgets_scope_ref" CHECK(("scope" = 'production') = ("production_id" IS NOT NULL) AND ("scope" = 'season') = ("season_id" IS NOT NULL) AND ("scope" = 'department') = ("department_term_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `budgets_categories` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`account_id` text,
	`sort_order` integer NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "budgets_categories_name_length" CHECK(length("name") BETWEEN 1 AND 60),
	CONSTRAINT "budgets_categories_description_length" CHECK(length("description") <= 300)
);
--> statement-breakpoint
CREATE TABLE `budgets_line_amounts` (
	`id` text PRIMARY KEY,
	`line_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`stage` text NOT NULL,
	`reason` text,
	`set_by` text,
	`set_at` integer NOT NULL,
	CONSTRAINT `fk_budgets_line_amounts_line_id_budgets_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `budgets_lines`(`id`),
	CONSTRAINT "budgets_line_amounts_amount" CHECK("amount_minor" >= 0),
	CONSTRAINT "budgets_line_amounts_stage" CHECK("stage" IN ('draft', 'approved')),
	CONSTRAINT "budgets_line_amounts_reason" CHECK("reason" IS NULL OR length("reason") <= 200)
);
--> statement-breakpoint
CREATE TABLE `budgets_line_sources` (
	`line_id` text NOT NULL,
	`account_key` text NOT NULL,
	CONSTRAINT `budgets_line_sources_pk` PRIMARY KEY(`line_id`, `account_key`),
	CONSTRAINT `fk_budgets_line_sources_line_id_budgets_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `budgets_lines`(`id`)
);
--> statement-breakpoint
CREATE TABLE `budgets_lines` (
	`id` text PRIMARY KEY,
	`budget_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`category_id` text,
	`sort_order` integer NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_budgets_lines_budget_id_budgets_budgets_id_fk` FOREIGN KEY (`budget_id`) REFERENCES `budgets_budgets`(`id`),
	CONSTRAINT `fk_budgets_lines_category_id_budgets_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `budgets_categories`(`id`),
	CONSTRAINT "budgets_lines_name_length" CHECK(length("name") BETWEEN 1 AND 80),
	CONSTRAINT "budgets_lines_kind" CHECK("kind" IN ('expense', 'income')),
	CONSTRAINT "budgets_lines_category" CHECK("kind" = 'income' OR "category_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_budgets_production` ON `budgets_budgets` (`production_id`) WHERE production_id IS NOT NULL AND state <> 'closed';--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_budgets_season` ON `budgets_budgets` (`season_id`) WHERE season_id IS NOT NULL AND state <> 'closed';--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_budgets_department` ON `budgets_budgets` (`department_term_id`,`year_starts_on`) WHERE department_term_id IS NOT NULL AND state <> 'closed';--> statement-breakpoint
CREATE INDEX `budgets_budgets_year` ON `budgets_budgets` (`year_starts_on`);--> statement-breakpoint
CREATE INDEX `budgets_budgets_parent` ON `budgets_budgets` (`parent_line_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_categories_slug` ON `budgets_categories` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_categories_name` ON `budgets_categories` (`name`) WHERE archived_at IS NULL;--> statement-breakpoint
CREATE INDEX `budgets_line_amounts_line` ON `budgets_line_amounts` (`line_id`,`stage`,`set_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_lines_name` ON `budgets_lines` (`budget_id`,`name`) WHERE archived_at IS NULL;--> statement-breakpoint
CREATE INDEX `budgets_lines_budget` ON `budgets_lines` (`budget_id`,`sort_order`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `budgets_line_amounts_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `budgets_line_amounts_append_only_delete` BEFORE DELETE ON `budgets_line_amounts` BEGIN SELECT RAISE(ABORT, 'append-only: budgets_line_amounts'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `budgets_line_amounts_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `budgets_line_amounts_append_only_update` BEFORE UPDATE ON `budgets_line_amounts` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`line_id` IS OLD.`line_id` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`stage` IS OLD.`stage` AND NEW.`reason` IS OLD.`reason` AND NEW.`set_by` IS OLD.`set_by` AND NEW.`set_at` IS OLD.`set_at`) BEGIN SELECT RAISE(ABORT, 'append-only: budgets_line_amounts'); END;

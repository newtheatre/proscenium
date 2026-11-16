CREATE TABLE `core_production_advisories` (
	`production_id` text NOT NULL,
	`term_id` text NOT NULL,
	`detail` text,
	`sort` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `core_production_advisories_pk` PRIMARY KEY(`production_id`, `term_id`),
	CONSTRAINT `fk_core_production_advisories_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_production_advisories_term_id_core_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "core_production_advisories_detail" CHECK("detail" IS NULL OR length("detail") <= 300)
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
	`age_guidance` text,
	`advisories_confirmed_none` integer DEFAULT false NOT NULL,
	`content_note` text,
	`running_minutes` integer,
	`interval_count` integer DEFAULT 0 NOT NULL,
	`external_booking_url` text,
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
	CONSTRAINT `fk_core_productions_cancel_reason_term_id_core_terms_id_fk` FOREIGN KEY (`cancel_reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "core_productions_state" CHECK("state" IN ('draft', 'published', 'withdrawn', 'cancelled')),
	CONSTRAINT "core_productions_kind" CHECK("kind" IN ('own', 'visiting', 'hire', 'event')),
	CONSTRAINT "core_productions_title" CHECK(length("title") BETWEEN 1 AND 200),
	CONSTRAINT "core_productions_summary" CHECK("summary" IS NULL OR length("summary") <= 300),
	CONSTRAINT "core_productions_age" CHECK("age_guidance" IS NULL OR length("age_guidance") <= 40),
	CONSTRAINT "core_productions_running" CHECK("running_minutes" IS NULL OR "running_minutes" > 0),
	CONSTRAINT "core_productions_intervals" CHECK("interval_count" >= 0),
	CONSTRAINT "core_productions_booking_url" CHECK("external_booking_url" IS NULL OR "external_booking_url" LIKE 'https://_%'),
	CONSTRAINT "core_productions_cancel_reason" CHECK(("state" = 'cancelled') = ("cancel_reason_term_id" IS NOT NULL))
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
CREATE UNIQUE INDEX `core_productions_slug` ON `core_productions` (`slug`);--> statement-breakpoint
CREATE INDEX `core_productions_listing` ON `core_productions` (`state`,`last_ends_at`);--> statement-breakpoint
CREATE INDEX `core_productions_season` ON `core_productions` (`season_id`);--> statement-breakpoint
CREATE INDEX `core_productions_category` ON `core_productions` (`category_term_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_seasons_slug` ON `core_seasons` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_seasons_name` ON `core_seasons` (lower("name"));
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_production_slugs_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_production_slugs_append_only_delete` BEFORE DELETE ON `core_production_slugs` BEGIN SELECT RAISE(ABORT, 'append-only: core_production_slugs'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_production_slugs_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_production_slugs_append_only_update` BEFORE UPDATE ON `core_production_slugs` WHEN NOT (NEW.`slug` IS OLD.`slug` AND NEW.`production_id` IS OLD.`production_id` AND NEW.`retired_at` IS OLD.`retired_at`) BEGIN SELECT RAISE(ABORT, 'append-only: core_production_slugs'); END;

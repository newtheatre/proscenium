CREATE TABLE `core_collection_productions` (
	`collection_id` text NOT NULL,
	`production_id` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `core_collection_productions_pk` PRIMARY KEY(`collection_id`, `production_id`),
	CONSTRAINT `fk_core_collection_productions_collection_id_core_collections_id_fk` FOREIGN KEY (`collection_id`) REFERENCES `core_collections`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_collection_productions_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `core_collection_slugs` (
	`slug` text PRIMARY KEY,
	`collection_id` text NOT NULL,
	`retired_at` integer NOT NULL,
	CONSTRAINT `fk_core_collection_slugs_collection_id_core_collections_id_fk` FOREIGN KEY (`collection_id`) REFERENCES `core_collections`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `core_collections` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`summary` text,
	`description` text,
	`colour` text NOT NULL,
	`season_id` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_core_collections_season_id_core_seasons_id_fk` FOREIGN KEY (`season_id`) REFERENCES `core_seasons`(`id`) ON DELETE SET NULL,
	CONSTRAINT "core_collections_state" CHECK("state" IN ('draft', 'published', 'archived')),
	CONSTRAINT "core_collections_name_length" CHECK(length("name") BETWEEN 1 AND 80),
	CONSTRAINT "core_collections_summary_length" CHECK("summary" IS NULL OR length("summary") <= 300),
	CONSTRAINT "core_collections_description_length" CHECK("description" IS NULL OR length("description") <= 5000),
	CONSTRAINT "core_collections_colour" CHECK("colour" GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]')
);
--> statement-breakpoint
CREATE INDEX `core_collection_productions_production` ON `core_collection_productions` (`production_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_collections_slug` ON `core_collections` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_collections_name` ON `core_collections` (lower("name"));
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_collection_slugs_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_collection_slugs_append_only_delete` BEFORE DELETE ON `core_collection_slugs` BEGIN SELECT RAISE(ABORT, 'append-only: core_collection_slugs'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_collection_slugs_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_collection_slugs_append_only_update` BEFORE UPDATE ON `core_collection_slugs` WHEN NOT (NEW.`slug` IS OLD.`slug` AND NEW.`collection_id` IS OLD.`collection_id` AND NEW.`retired_at` IS OLD.`retired_at`) BEGIN SELECT RAISE(ABORT, 'append-only: core_collection_slugs'); END;

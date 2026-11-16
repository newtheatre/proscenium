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
	`state` text DEFAULT 'active' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_core_spaces_venue_id_core_venues_id_fk` FOREIGN KEY (`venue_id`) REFERENCES `core_venues`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_core_spaces_kind_term_id_core_terms_id_fk` FOREIGN KEY (`kind_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "core_spaces_state" CHECK("state" IN ('active', 'archived')),
	CONSTRAINT "core_spaces_capacity" CHECK("default_capacity" IS NULL OR "default_capacity" > 0)
);
--> statement-breakpoint
CREATE TABLE `core_venues` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`managed` integer DEFAULT true NOT NULL,
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
CREATE UNIQUE INDEX `core_place_access_term` ON `core_place_access` (`venue_id`,coalesce("space_id", ''),`term_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_spaces_venue_pair` ON `core_spaces` (`id`,`venue_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_spaces_slug` ON `core_spaces` (`venue_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_spaces_name` ON `core_spaces` (`venue_id`,lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `core_venues_name` ON `core_venues` (lower("name"));
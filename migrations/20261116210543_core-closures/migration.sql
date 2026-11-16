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
CREATE INDEX `core_closures_time` ON `core_closures` (`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `core_closures_venue` ON `core_closures` (`venue_id`,`starts_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_closures_feed_ref` ON `core_closures` (`feed_ref`) WHERE "core_closures"."feed_ref" IS NOT NULL;
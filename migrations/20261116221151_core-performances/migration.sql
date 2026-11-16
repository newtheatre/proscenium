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
	`capacity` integer,
	`label` text,
	`external_booking_url` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`cancelled_at` integer,
	`cancel_reason_term_id` text,
	`cancel_note` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_core_performances_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_core_performances_venue_id_core_venues_id_fk` FOREIGN KEY (`venue_id`) REFERENCES `core_venues`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_core_performances_cancel_reason_term_id_core_terms_id_fk` FOREIGN KEY (`cancel_reason_term_id`) REFERENCES `core_terms`(`id`),
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
CREATE INDEX `core_performances_starts` ON `core_performances` (`starts_at`);--> statement-breakpoint
CREATE INDEX `core_performances_day` ON `core_performances` (`operating_day`);--> statement-breakpoint
CREATE INDEX `core_performances_production` ON `core_performances` (`production_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `core_performances_venue` ON `core_performances` (`venue_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `core_performances_space` ON `core_performances` (`space_id`,`starts_at`);
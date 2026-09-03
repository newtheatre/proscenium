CREATE TABLE `content_warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`category` text,
	`description` text,
	`icon` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	CONSTRAINT "content_warnings_kind_values" CHECK("content_warnings"."kind" IN ('TECHNICAL', 'GENERAL'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_warnings_slug` ON `content_warnings` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_warnings_title` ON `content_warnings` (`title`);--> statement-breakpoint
CREATE TABLE `performance_ticket_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`price` integer,
	`active` integer,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "performance_ticket_overrides_price_pence" CHECK("performance_ticket_overrides"."price" IS NULL OR "performance_ticket_overrides"."price" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `performance_ticket_overrides_pair` ON `performance_ticket_overrides` (`performance_id`,`ticket_type_id`);--> statement-breakpoint
CREATE TABLE `performances` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`doors_at` integer,
	`duration_minutes` integer,
	`interval_count` integer DEFAULT 0 NOT NULL,
	`interval_minutes` integer,
	`capacity_override` integer,
	`booking_closes_hours_before` integer,
	`hold_release_minutes_before` integer,
	`external_booking_url` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "performances_status_values" CHECK("performances"."status" IN ('DRAFT', 'ON_SALE', 'CANCELLED')),
	CONSTRAINT "performances_capacity_override" CHECK("performances"."capacity_override" IS NULL OR "performances"."capacity_override" >= 0),
	CONSTRAINT "performances_interval_count" CHECK("performances"."interval_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `performances_starts_at` ON `performances` (`starts_at`);--> statement-breakpoint
CREATE INDEX `performances_venue_starts_at` ON `performances` (`venue_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `performances_show` ON `performances` (`show_id`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	CONSTRAINT "seasons_order" CHECK("seasons"."ends_on" > "seasons"."starts_on")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_name` ON `seasons` (`name`);--> statement-breakpoint
CREATE TABLE `show_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `show_categories_name` ON `show_categories` (`name`);--> statement-breakpoint
CREATE TABLE `show_content_warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`warning_id` text NOT NULL,
	`level` text,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`warning_id`) REFERENCES `content_warnings`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "show_content_warnings_level_values" CHECK("show_content_warnings"."level" IS NULL OR "show_content_warnings"."level" IN ('MENTIONED', 'DISCUSSED', 'DEPICTED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `show_content_warnings_pair` ON `show_content_warnings` (`show_id`,`warning_id`);--> statement-breakpoint
CREATE TABLE `show_ticket_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`price` integer,
	`active` integer,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "show_ticket_overrides_price_pence" CHECK("show_ticket_overrides"."price" IS NULL OR "show_ticket_overrides"."price" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `show_ticket_overrides_pair` ON `show_ticket_overrides` (`show_id`,`ticket_type_id`);--> statement-breakpoint
CREATE TABLE `shows` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`description` text,
	`long_description` text,
	`poster_key` text,
	`category_id` text,
	`season_id` text,
	`age_guidance` text,
	`latecomer_policy` text,
	`warnings_confirmed_none` integer DEFAULT false NOT NULL,
	`content_notes` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`production_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `show_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "shows_status_values" CHECK("shows"."status" IN ('DRAFT', 'PUBLISHED')),
	CONSTRAINT "shows_latecomer_policy_values" CHECK("shows"."latecomer_policy" IS NULL OR "shows"."latecomer_policy" IN ('ADMITTED', 'AT_INTERVAL', 'NOT_ADMITTED'))
);
--> statement-breakpoint
CREATE INDEX `shows_status` ON `shows` (`status`);--> statement-breakpoint
CREATE INDEX `shows_season` ON `shows` (`season_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shows_slug` ON `shows` (`slug`);--> statement-breakpoint
CREATE TABLE `ticket_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price` integer NOT NULL,
	`kind` text NOT NULL,
	`access_kind` text,
	`archived` integer DEFAULT false NOT NULL,
	`active_by_default` integer DEFAULT true NOT NULL,
	CONSTRAINT "ticket_types_kind_values" CHECK("ticket_types"."kind" IN ('SINGLE', 'PASS_ADMISSION')),
	CONSTRAINT "ticket_types_access_kind_values" CHECK("ticket_types"."access_kind" IS NULL OR "ticket_types"."access_kind" IN ('ACCESS', 'COMPANION')),
	CONSTRAINT "ticket_types_price_pence" CHECK("ticket_types"."price" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_types_name` ON `ticket_types` (`name`);--> statement-breakpoint
CREATE TABLE `venue_emergency_info` (
	`venue_id` text PRIMARY KEY NOT NULL,
	`assembly_point` text,
	`exits` text,
	`isolation_points` text,
	`what3words` text,
	`notes` text,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `venues` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`capacity` integer,
	`is_external` integer DEFAULT false NOT NULL,
	`image_key` text,
	`description` text,
	`room_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "venues_capacity_positive" CHECK("venues"."capacity" IS NULL OR "venues"."capacity" > 0)
);
--> statement-breakpoint
CREATE INDEX `venues_room` ON `venues` (`room_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `venues_name` ON `venues` (`name`);
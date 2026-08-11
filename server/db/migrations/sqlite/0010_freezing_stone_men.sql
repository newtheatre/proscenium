CREATE TABLE `content_warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`icon` text,
	`legacy_category` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_warnings_title_unique` ON `content_warnings` (`title`);--> statement-breakpoint
CREATE TABLE `legacy_id_map` (
	`id` text PRIMARY KEY NOT NULL,
	`source_system` text DEFAULT 'ticketing-heroku' NOT NULL,
	`source_table` text NOT NULL,
	`source_id` text NOT NULL,
	`target_table` text NOT NULL,
	`target_id` text NOT NULL,
	`confidence` text DEFAULT 'DIRECT' NOT NULL,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `legacy_id_map_target_idx` ON `legacy_id_map` (`target_table`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `legacy_id_map_source_unique` ON `legacy_id_map` (`source_system`,`source_table`,`source_id`,`target_table`);--> statement-breakpoint
CREATE TABLE `legacy_records` (
	`id` text PRIMARY KEY NOT NULL,
	`source_system` text DEFAULT 'ticketing-heroku' NOT NULL,
	`source_table` text NOT NULL,
	`source_id` text NOT NULL,
	`payload` text NOT NULL,
	`redacted_at` text,
	`imported_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `legacy_records_source_table_idx` ON `legacy_records` (`source_table`);--> statement-breakpoint
CREATE UNIQUE INDEX `legacy_records_source_unique` ON `legacy_records` (`source_system`,`source_table`,`source_id`);--> statement-breakpoint
CREATE TABLE `show_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `show_categories_name_unique` ON `show_categories` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `show_categories_slug_unique` ON `show_categories` (`slug`);--> statement-breakpoint
CREATE TABLE `show_content_warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`content_warning_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`content_warning_id`) REFERENCES `content_warnings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `show_content_warnings_show_id_idx` ON `show_content_warnings` (`show_id`);--> statement-breakpoint
CREATE INDEX `show_content_warnings_warning_id_idx` ON `show_content_warnings` (`content_warning_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `show_content_warnings_unique` ON `show_content_warnings` (`show_id`,`content_warning_id`,`kind`);--> statement-breakpoint
CREATE TABLE `venue_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`alias` text NOT NULL,
	`source` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `venue_aliases_venue_id_idx` ON `venue_aliases` (`venue_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `venue_aliases_alias_unique` ON `venue_aliases` (`alias`);--> statement-breakpoint
ALTER TABLE `performances` ADD `booking_closes_hours_before` integer;--> statement-breakpoint
ALTER TABLE `reservations` ADD `legacy_ref` text;--> statement-breakpoint
ALTER TABLE `reservations` ADD `source` text DEFAULT 'WEB' NOT NULL;--> statement-breakpoint
ALTER TABLE `reservations` ADD `original_quantity` integer;--> statement-breakpoint
ALTER TABLE `reservations` ADD `anonymised_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_legacy_ref_unique` ON `reservations` (`legacy_ref`);--> statement-breakpoint
ALTER TABLE `shows` ADD `long_description` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `programme_url` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `external_url` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `category_id` text REFERENCES show_categories(id);--> statement-breakpoint
ALTER TABLE `shows` ADD `content_warning_notes` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `warnings_confirmed_none` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `shows_category_id_idx` ON `shows` (`category_id`);--> statement-breakpoint
ALTER TABLE `ticket_types` ADD `kind` text DEFAULT 'SINGLE' NOT NULL;--> statement-breakpoint
ALTER TABLE `ticket_types` ADD `archived` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `price_confidence` text DEFAULT 'EXACT' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `anonymised_at` text;
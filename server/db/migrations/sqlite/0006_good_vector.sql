CREATE TABLE `performances` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`doors_at` integer,
	`duration_minutes` integer,
	`interval_count` integer DEFAULT 0 NOT NULL,
	`capacity_override` integer,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `performances_show_id_idx` ON `performances` (`show_id`);--> statement-breakpoint
CREATE INDEX `performances_venue_id_idx` ON `performances` (`venue_id`);--> statement-breakpoint
CREATE INDEX `performances_starts_at_idx` ON `performances` (`starts_at`);--> statement-breakpoint
CREATE INDEX `performances_status_idx` ON `performances` (`status`);--> statement-breakpoint
CREATE TABLE `shows` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`description` text,
	`poster_url` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shows_slug_unique` ON `shows` (`slug`);--> statement-breakpoint
CREATE INDEX `shows_title_idx` ON `shows` (`title`);--> statement-breakpoint
CREATE INDEX `shows_status_idx` ON `shows` (`status`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_performance_ticket_type_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`price` integer,
	`active` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_performance_ticket_type_overrides`("id", "performance_id", "ticket_type_id", "price", "active", "created_at", "updated_at") SELECT "id", "performance_id", "ticket_type_id", "price", "active", "created_at", "updated_at" FROM `performance_ticket_type_overrides`;--> statement-breakpoint
DROP TABLE `performance_ticket_type_overrides`;--> statement-breakpoint
ALTER TABLE `__new_performance_ticket_type_overrides` RENAME TO `performance_ticket_type_overrides`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `perf_ttp_overrides_performance_id_idx` ON `performance_ticket_type_overrides` (`performance_id`);--> statement-breakpoint
CREATE INDEX `perf_ttp_overrides_ticket_type_id_idx` ON `performance_ticket_type_overrides` (`ticket_type_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `perf_ttp_overrides_performance_ticket_unique` ON `performance_ticket_type_overrides` (`performance_id`,`ticket_type_id`);--> statement-breakpoint
CREATE TABLE `__new_show_ticket_type_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`price` integer,
	`active` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_show_ticket_type_overrides`("id", "show_id", "ticket_type_id", "price", "active", "created_at", "updated_at") SELECT "id", "show_id", "ticket_type_id", "price", "active", "created_at", "updated_at" FROM `show_ticket_type_overrides`;--> statement-breakpoint
DROP TABLE `show_ticket_type_overrides`;--> statement-breakpoint
ALTER TABLE `__new_show_ticket_type_overrides` RENAME TO `show_ticket_type_overrides`;--> statement-breakpoint
CREATE INDEX `show_ttp_overrides_show_id_idx` ON `show_ticket_type_overrides` (`show_id`);--> statement-breakpoint
CREATE INDEX `show_ttp_overrides_ticket_type_id_idx` ON `show_ticket_type_overrides` (`ticket_type_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `show_ttp_overrides_show_ticket_unique` ON `show_ticket_type_overrides` (`show_id`,`ticket_type_id`);--> statement-breakpoint
CREATE TABLE `__new_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`price_paid` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_tickets`("id", "reservation_id", "performance_id", "ticket_type_id", "price_paid", "status", "created_at", "updated_at") SELECT "id", "reservation_id", "performance_id", "ticket_type_id", "price_paid", "status", "created_at", "updated_at" FROM `tickets`;--> statement-breakpoint
DROP TABLE `tickets`;--> statement-breakpoint
ALTER TABLE `__new_tickets` RENAME TO `tickets`;--> statement-breakpoint
CREATE INDEX `tickets_reservation_id_idx` ON `tickets` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `tickets_performance_id_idx` ON `tickets` (`performance_id`);--> statement-breakpoint
CREATE INDEX `tickets_ticket_type_id_idx` ON `tickets` (`ticket_type_id`);--> statement-breakpoint
CREATE INDEX `tickets_status_idx` ON `tickets` (`status`);
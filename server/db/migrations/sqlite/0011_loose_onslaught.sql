CREATE TABLE `pass_admissions` (
	`id` text PRIMARY KEY NOT NULL,
	`pass_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`redeemed_at` text DEFAULT (current_timestamp) NOT NULL,
	`redeemed_by_user_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`pass_id`) REFERENCES `passes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`redeemed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pass_admissions_ticket_unique` ON `pass_admissions` (`ticket_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pass_admissions_pass_performance_unique` ON `pass_admissions` (`pass_id`,`performance_id`);--> statement-breakpoint
CREATE INDEX `pass_admissions_pass_id_idx` ON `pass_admissions` (`pass_id`);--> statement-breakpoint
CREATE INDEX `pass_admissions_performance_id_idx` ON `pass_admissions` (`performance_id`);--> statement-breakpoint
CREATE TABLE `pass_type_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`pass_type_id` text NOT NULL,
	`label` text NOT NULL,
	`price` integer NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`pass_type_id`) REFERENCES `pass_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pass_type_prices_pass_type_id_idx` ON `pass_type_prices` (`pass_type_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pass_type_prices_unique` ON `pass_type_prices` (`pass_type_id`,`label`);--> statement-breakpoint
CREATE TABLE `pass_type_shows` (
	`id` text PRIMARY KEY NOT NULL,
	`pass_type_id` text NOT NULL,
	`show_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`pass_type_id`) REFERENCES `pass_types`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pass_type_shows_pass_type_id_idx` ON `pass_type_shows` (`pass_type_id`);--> statement-breakpoint
CREATE INDEX `pass_type_shows_show_id_idx` ON `pass_type_shows` (`show_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pass_type_shows_unique` ON `pass_type_shows` (`pass_type_id`,`show_id`);--> statement-breakpoint
CREATE TABLE `pass_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`season_id` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`valid_from` integer NOT NULL,
	`valid_to` integer NOT NULL,
	`sales_open_at` integer,
	`sales_close_at` integer,
	`max_issued` integer,
	`transferable` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pass_types_name_unique` ON `pass_types` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `pass_types_slug_unique` ON `pass_types` (`slug`);--> statement-breakpoint
CREATE INDEX `pass_types_season_id_idx` ON `pass_types` (`season_id`);--> statement-breakpoint
CREATE INDEX `pass_types_status_idx` ON `pass_types` (`status`);--> statement-breakpoint
CREATE TABLE `passes` (
	`id` text PRIMARY KEY NOT NULL,
	`pass_type_id` text NOT NULL,
	`pass_type_price_id` text,
	`user_id` text NOT NULL,
	`reference` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`price_paid` integer NOT NULL,
	`issued_at` text DEFAULT (current_timestamp) NOT NULL,
	`issued_by_user_id` text,
	`reservation_id` text,
	`notes` text,
	`cancelled_at` text,
	`cancelled_by` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`pass_type_id`) REFERENCES `pass_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pass_type_price_id`) REFERENCES `pass_type_prices`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passes_reference_unique` ON `passes` (`reference`);--> statement-breakpoint
CREATE INDEX `passes_pass_type_id_idx` ON `passes` (`pass_type_id`);--> statement-breakpoint
CREATE INDEX `passes_user_id_idx` ON `passes` (`user_id`);--> statement-breakpoint
CREATE INDEX `passes_status_idx` ON `passes` (`status`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_name_unique` ON `seasons` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_slug_unique` ON `seasons` (`slug`);--> statement-breakpoint
CREATE INDEX `seasons_starts_at_idx` ON `seasons` (`starts_at`);--> statement-breakpoint
ALTER TABLE `shows` ADD `season_id` text REFERENCES seasons(id);--> statement-breakpoint
CREATE INDEX `shows_season_id_idx` ON `shows` (`season_id`);
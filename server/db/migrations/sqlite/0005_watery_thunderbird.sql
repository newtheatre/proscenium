CREATE TABLE `performance_ticket_type_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`price` integer,
	`active` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `perf_ttp_overrides_performance_id_idx` ON `performance_ticket_type_overrides` (`performance_id`);--> statement-breakpoint
CREATE INDEX `perf_ttp_overrides_ticket_type_id_idx` ON `performance_ticket_type_overrides` (`ticket_type_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `perf_ttp_overrides_performance_ticket_unique` ON `performance_ticket_type_overrides` (`performance_id`,`ticket_type_id`);--> statement-breakpoint
CREATE TABLE `show_ticket_type_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`show_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`price` integer,
	`active` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `show_ttp_overrides_show_id_idx` ON `show_ticket_type_overrides` (`show_id`);--> statement-breakpoint
CREATE INDEX `show_ttp_overrides_ticket_type_id_idx` ON `show_ticket_type_overrides` (`ticket_type_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `show_ttp_overrides_show_ticket_unique` ON `show_ticket_type_overrides` (`show_id`,`ticket_type_id`);--> statement-breakpoint
CREATE TABLE `ticket_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price` integer NOT NULL,
	`active_by_default` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_types_name_unique` ON `ticket_types` (`name`);--> statement-breakpoint
CREATE INDEX `ticket_types_name_idx` ON `ticket_types` (`name`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`price_paid` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `tickets_reservation_id_idx` ON `tickets` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `tickets_performance_id_idx` ON `tickets` (`performance_id`);--> statement-breakpoint
CREATE INDEX `tickets_ticket_type_id_idx` ON `tickets` (`ticket_type_id`);--> statement-breakpoint
CREATE INDEX `tickets_status_idx` ON `tickets` (`status`);
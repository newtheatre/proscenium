CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_ref` text NOT NULL,
	`performance_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`cancelled_by` text,
	`customer_notes` text,
	`staff_notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_booking_ref_unique` ON `reservations` (`booking_ref`);--> statement-breakpoint
CREATE INDEX `reservations_performance_id_idx` ON `reservations` (`performance_id`);--> statement-breakpoint
CREATE INDEX `reservations_user_id_idx` ON `reservations` (`user_id`);--> statement-breakpoint
CREATE INDEX `reservations_status_idx` ON `reservations` (`status`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`price_paid` integer NOT NULL,
	`refunded_at` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_tickets`("id", "reservation_id", "performance_id", "ticket_type_id", "price_paid", "created_at", "updated_at") SELECT "id", "reservation_id", "performance_id", "ticket_type_id", "price_paid", "created_at", "updated_at" FROM `tickets`;--> statement-breakpoint
DROP TABLE `tickets`;--> statement-breakpoint
ALTER TABLE `__new_tickets` RENAME TO `tickets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `tickets_reservation_id_idx` ON `tickets` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `tickets_performance_id_idx` ON `tickets` (`performance_id`);--> statement-breakpoint
CREATE INDEX `tickets_ticket_type_id_idx` ON `tickets` (`ticket_type_id`);
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`performance_id` text NOT NULL,
	`user_id` text,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`hold_expires_at` integer,
	`cancelled_by` text,
	`customer_notes` text,
	`staff_notes` text,
	`qr_token_hash` text,
	`window_bypassed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reservations_status_values" CHECK("reservations"."status" IN ('PENDING', 'COLLECTED', 'DOOR', 'EXPIRED', 'CANCELLED', 'NO_SHOW')),
	CONSTRAINT "reservations_source_values" CHECK("reservations"."source" IN ('WEB', 'DESK', 'DOOR')),
	CONSTRAINT "reservations_cancelled_by_values" CHECK("reservations"."cancelled_by" IS NULL OR "reservations"."cancelled_by" IN ('CUSTOMER', 'STAFF'))
);
--> statement-breakpoint
CREATE INDEX `reservations_performance_status` ON `reservations` (`performance_id`,`status`);--> statement-breakpoint
CREATE INDEX `reservations_user_created` ON `reservations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `reservations_hold_expires_at` ON `reservations` (`hold_expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_reference` ON `reservations` (`reference`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`price_paid` integer NOT NULL,
	`price_source` text NOT NULL,
	`refunded_at` integer,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "tickets_price_paid_pence" CHECK("tickets"."price_paid" >= 0),
	CONSTRAINT "tickets_price_source_values" CHECK("tickets"."price_source" IN ('PERFORMANCE', 'SHOW', 'BASE', 'IMPORT'))
);
--> statement-breakpoint
CREATE INDEX `tickets_performance_refunded` ON `tickets` (`performance_id`,`refunded_at`);--> statement-breakpoint
CREATE INDEX `tickets_reservation` ON `tickets` (`reservation_id`);
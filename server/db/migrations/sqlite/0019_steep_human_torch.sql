CREATE TABLE `room_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`attendees` integer,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`tier` text DEFAULT 'GENERAL' NOT NULL,
	`status` text DEFAULT 'CONFIRMED' NOT NULL,
	`notes` text,
	`rejection_reason` text,
	`no_show_recorded_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "room_bookings_span" CHECK("room_bookings"."ends_at" > "room_bookings"."starts_at"),
	CONSTRAINT "room_bookings_status" CHECK("room_bookings"."status" IN ('CONFIRMED', 'PENDING_APPROVAL', 'REJECTED', 'CANCELLED', 'BUMPED'))
);
--> statement-breakpoint
CREATE INDEX `room_bookings_clash` ON `room_bookings` (`room_id`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `room_bookings_user` ON `room_bookings` (`user_id`);--> statement-breakpoint
ALTER TABLE `rooms` ADD `min_booking_minutes` integer;--> statement-breakpoint
ALTER TABLE `rooms` ADD `max_booking_hours` integer;--> statement-breakpoint
ALTER TABLE `rooms` ADD `notice_hours` integer;--> statement-breakpoint
ALTER TABLE `rooms` ADD `horizon_weeks` integer;--> statement-breakpoint
ALTER TABLE `rooms` ADD `active_bookings_cap` integer;
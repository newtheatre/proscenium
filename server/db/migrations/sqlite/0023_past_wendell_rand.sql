CREATE TABLE `room_series` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`title` text NOT NULL,
	`frequency` text NOT NULL,
	`weekdays` text,
	`starts_on` text NOT NULL,
	`clock_from` text NOT NULL,
	`clock_to` text NOT NULL,
	`occurrences` integer NOT NULL,
	`head_booking_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "room_series_frequency" CHECK("room_series"."frequency" IN ('DAILY', 'WEEKLY')),
	CONSTRAINT "room_series_occurrences" CHECK("room_series"."occurrences" > 0)
);
--> statement-breakpoint
CREATE INDEX `room_series_user` ON `room_series` (`user_id`);--> statement-breakpoint
ALTER TABLE `room_bookings` ADD `series_id` text REFERENCES room_series(id);--> statement-breakpoint
ALTER TABLE `room_bookings` ADD `occurrence` integer;--> statement-breakpoint
CREATE INDEX `room_bookings_series` ON `room_bookings` (`series_id`);
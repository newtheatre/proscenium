CREATE TABLE `room_no_shows` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text DEFAULT 'RECORDED' NOT NULL,
	`reason` text,
	`supersedes_id` text,
	`recorded_by` text,
	`recorded_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `room_bookings`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "room_no_shows_kind" CHECK("room_no_shows"."kind" IN ('RECORDED', 'WITHDRAWN'))
);
--> statement-breakpoint
CREATE INDEX `room_no_shows_user` ON `room_no_shows` (`user_id`);--> statement-breakpoint
CREATE INDEX `room_no_shows_booking` ON `room_no_shows` (`booking_id`);
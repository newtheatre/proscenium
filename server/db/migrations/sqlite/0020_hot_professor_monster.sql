ALTER TABLE `room_bookings` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `room_bookings` ADD `escalated_at` integer;--> statement-breakpoint
CREATE INDEX `room_bookings_status` ON `room_bookings` (`status`);
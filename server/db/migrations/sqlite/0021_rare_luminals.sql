ALTER TABLE `room_bookings` ADD `decided_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `room_bookings` ADD `decided_at` integer;
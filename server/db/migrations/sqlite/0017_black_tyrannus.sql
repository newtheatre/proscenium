CREATE TABLE `room_hours` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`opens` text NOT NULL,
	`closes` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "room_hours_weekday" CHECK("room_hours"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "room_hours_order" CHECK("room_hours"."closes" > "room_hours"."opens")
);
--> statement-breakpoint
CREATE INDEX `room_hours_room` ON `room_hours` (`room_id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`capacity` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`sensitive` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "rooms_capacity_positive" CHECK("rooms"."capacity" IS NULL OR "rooms"."capacity" > 0)
);
--> statement-breakpoint
CREATE INDEX `rooms_is_active` ON `rooms` (`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_name` ON `rooms` (`name`);
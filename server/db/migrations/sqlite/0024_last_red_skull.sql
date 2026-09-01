CREATE TABLE `room_blackouts` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text,
	`reason` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "room_blackouts_span" CHECK("room_blackouts"."ends_at" > "room_blackouts"."starts_at")
);
--> statement-breakpoint
CREATE INDEX `room_blackouts_span` ON `room_blackouts` (`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `room_blackouts_room` ON `room_blackouts` (`room_id`);
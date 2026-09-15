CREATE TABLE `bar_opening_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`opening_id` text NOT NULL,
	`slot` integer NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`assigned_by` text,
	`claimed_at` integer,
	`confirmed_at` integer,
	`notes` text,
	`decline_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`opening_id`) REFERENCES `bar_openings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "bar_opening_shifts_status_values" CHECK("bar_opening_shifts"."status" IN ('OPEN', 'CLAIMED', 'CONFIRMED', 'DECLINED', 'CANCELLED')),
	CONSTRAINT "bar_opening_shifts_slot_positive" CHECK("bar_opening_shifts"."slot" >= 1),
	CONSTRAINT "bar_opening_shifts_open_names_nobody" CHECK(
    ("bar_opening_shifts"."status" = 'OPEN' AND "bar_opening_shifts"."user_id" IS NULL)
    OR ("bar_opening_shifts"."status" IN ('CLAIMED', 'CONFIRMED', 'DECLINED') AND "bar_opening_shifts"."user_id" IS NOT NULL)
    OR "bar_opening_shifts"."status" = 'CANCELLED'
  )
);
--> statement-breakpoint
CREATE INDEX `bar_opening_shifts_opening` ON `bar_opening_shifts` (`opening_id`);--> statement-breakpoint
CREATE INDEX `bar_opening_shifts_user` ON `bar_opening_shifts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bar_opening_shifts_opening_slot` ON `bar_opening_shifts` (`opening_id`,`slot`);--> statement-breakpoint
CREATE TABLE `bar_openings` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`night` text NOT NULL,
	`label` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`status` text DEFAULT 'PLANNED' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "bar_openings_status_values" CHECK("bar_openings"."status" IN ('PLANNED', 'CANCELLED')),
	CONSTRAINT "bar_openings_ends_after_start" CHECK("bar_openings"."ends_at" > "bar_openings"."starts_at")
);
--> statement-breakpoint
CREATE INDEX `bar_openings_venue_night` ON `bar_openings` (`venue_id`,`night`);
CREATE TABLE `till_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`night` text NOT NULL,
	`opened_by` text NOT NULL,
	`opened_at` integer DEFAULT (unixepoch()) NOT NULL,
	`closed_by` text,
	`closed_at` integer,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`opened_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "till_sessions_close_is_whole" CHECK(("till_sessions"."closed_at" IS NULL) = ("till_sessions"."closed_by" IS NULL)),
	CONSTRAINT "till_sessions_closes_after_it_opens" CHECK("till_sessions"."closed_at" IS NULL OR "till_sessions"."closed_at" >= "till_sessions"."opened_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `till_sessions_one_open_per_venue_night` ON `till_sessions` (`venue_id`,`night`) WHERE closed_at IS NULL;--> statement-breakpoint
CREATE INDEX `till_sessions_unclosed` ON `till_sessions` (`night`) WHERE closed_at IS NULL;
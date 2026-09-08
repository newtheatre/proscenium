CREATE TABLE `health_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`opened_at` integer DEFAULT (unixepoch()) NOT NULL,
	`closed_at` integer,
	CONSTRAINT "health_incidents_status_values" CHECK("health_incidents"."status" IN ('OPEN', 'CLOSED')),
	CONSTRAINT "health_incidents_close_is_whole" CHECK(("health_incidents"."status" = 'OPEN') = ("health_incidents"."closed_at" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_incidents_one_open` ON `health_incidents` (`status`) WHERE status = 'OPEN';
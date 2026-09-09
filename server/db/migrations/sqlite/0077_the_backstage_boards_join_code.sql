CREATE TABLE `backstage_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`night_id` text NOT NULL,
	`label` text NOT NULL,
	`token_hash` text NOT NULL,
	`joined_epoch` integer NOT NULL,
	`joined_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_seen_at` integer,
	FOREIGN KEY (`night_id`) REFERENCES `backstage_nights`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `backstage_devices_night` ON `backstage_devices` (`night_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `backstage_devices_token_hash` ON `backstage_devices` (`token_hash`);--> statement-breakpoint
CREATE TABLE `backstage_nights` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`night` text NOT NULL,
	`epoch` integer DEFAULT 0 NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "backstage_nights_epoch_not_negative" CHECK("backstage_nights"."epoch" >= 0),
	CONSTRAINT "backstage_nights_failed_attempts_not_negative" CHECK("backstage_nights"."failed_attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backstage_nights_venue_night` ON `backstage_nights` (`venue_id`,`night`);
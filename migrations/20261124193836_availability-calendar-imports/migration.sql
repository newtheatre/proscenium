CREATE TABLE `availability_calendar_connections` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`ics_url` text,
	`token` text,
	`provider_subject` text,
	`tentative_as` text DEFAULT 'maybe' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`last_synced_at` integer,
	`last_tried_at` integer,
	`failures` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "availability_calendar_connections_label" CHECK(length("label") BETWEEN 1 AND 40),
	CONSTRAINT "availability_calendar_connections_kind" CHECK("kind" IN ('ics', 'google', 'microsoft')),
	CONSTRAINT "availability_calendar_connections_tentative" CHECK("tentative_as" IN ('maybe', 'busy', 'ignore')),
	CONSTRAINT "availability_calendar_connections_state" CHECK("state" IN ('active', 'failing', 'broken')),
	CONSTRAINT "availability_calendar_connections_source" CHECK(("kind" = 'ics' AND "ics_url" IS NOT NULL) OR ("kind" != 'ics' AND "token" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `availability_imported_blocks` (
	`id` text PRIMARY KEY,
	`connection_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`level` text NOT NULL,
	CONSTRAINT `fk_availability_imported_blocks_connection_id_availability_calendar_connections_id_fk` FOREIGN KEY (`connection_id`) REFERENCES `availability_calendar_connections`(`id`),
	CONSTRAINT "availability_imported_blocks_times" CHECK("ends_at" > "starts_at"),
	CONSTRAINT "availability_imported_blocks_level" CHECK("level" IN ('busy', 'maybe'))
);
--> statement-breakpoint
CREATE INDEX `availability_calendar_connections_account` ON `availability_calendar_connections` (`account_id`);--> statement-breakpoint
CREATE INDEX `availability_calendar_connections_due` ON `availability_calendar_connections` (`state`,`last_tried_at`);--> statement-breakpoint
CREATE INDEX `availability_imported_blocks_connection` ON `availability_imported_blocks` (`connection_id`,`starts_at`);
CREATE TABLE `external_space_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`purpose` text NOT NULL,
	`verdict` text NOT NULL,
	`reason` text NOT NULL,
	`written_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `external_spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`written_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "external_space_notes_verdict" CHECK("external_space_notes"."verdict" IN ('SUITABLE', 'CAUTION', 'UNSUITABLE'))
);
--> statement-breakpoint
CREATE INDEX `external_space_notes_space` ON `external_space_notes` (`space_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_space_notes_space_purpose` ON `external_space_notes` (`space_id`,`purpose`);--> statement-breakpoint
CREATE TABLE `external_spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`campus` text,
	`building` text,
	`contact` text,
	`capacity` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "external_spaces_capacity" CHECK("external_spaces"."capacity" IS NULL OR "external_spaces"."capacity" > 0)
);
--> statement-breakpoint
CREATE INDEX `external_spaces_active` ON `external_spaces` (`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_spaces_name` ON `external_spaces` (`name`);
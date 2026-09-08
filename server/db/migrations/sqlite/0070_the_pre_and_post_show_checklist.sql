CREATE TABLE `checklist_closes` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`night` text NOT NULL,
	`closed_by` text NOT NULL,
	`closed_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_closes_venue_night` ON `checklist_closes` (`venue_id`,`night`);--> statement-breakpoint
CREATE TABLE `checklist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`phase` text NOT NULL,
	`label` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`system_check` text,
	`active` integer DEFAULT true NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "checklist_items_phase_values" CHECK("checklist_items"."phase" IN ('PRE', 'POST')),
	CONSTRAINT "checklist_items_system_check_values" CHECK("checklist_items"."system_check" IS NULL OR "checklist_items"."system_check" IN ('NO_SHOW_HOLDS_RELEASED', 'INCIDENTS_REVIEWED'))
);
--> statement-breakpoint
CREATE INDEX `checklist_items_venue` ON `checklist_items` (`venue_id`);--> statement-breakpoint
CREATE TABLE `checklist_stamps` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`night` text NOT NULL,
	`item_id` text NOT NULL,
	`phase` text NOT NULL,
	`label` text NOT NULL,
	`sort` integer NOT NULL,
	`required` integer NOT NULL,
	`system_check` text,
	`ticked_by` text,
	`ticked_at` integer,
	`exempted` integer DEFAULT false NOT NULL,
	`exempt_reason` text,
	`exempted_by` text,
	`exempted_at` integer,
	`stamped_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`item_id`) REFERENCES `checklist_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ticked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`exempted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "checklist_stamps_phase_values" CHECK("checklist_stamps"."phase" IN ('PRE', 'POST')),
	CONSTRAINT "checklist_stamps_ticked_shape" CHECK(
    ("checklist_stamps"."ticked_by" IS NULL AND "checklist_stamps"."ticked_at" IS NULL) OR ("checklist_stamps"."ticked_by" IS NOT NULL AND "checklist_stamps"."ticked_at" IS NOT NULL)
  ),
	CONSTRAINT "checklist_stamps_exempt_shape" CHECK(
    ("checklist_stamps"."exempted" = 0 AND "checklist_stamps"."exempt_reason" IS NULL AND "checklist_stamps"."exempted_by" IS NULL AND "checklist_stamps"."exempted_at" IS NULL)
    OR ("checklist_stamps"."exempted" = 1 AND "checklist_stamps"."exempt_reason" IS NOT NULL AND "checklist_stamps"."exempted_by" IS NOT NULL AND "checklist_stamps"."exempted_at" IS NOT NULL)
  ),
	CONSTRAINT "checklist_stamps_not_ticked_and_exempted" CHECK(NOT ("checklist_stamps"."ticked_at" IS NOT NULL AND "checklist_stamps"."exempted" = 1)),
	CONSTRAINT "checklist_stamps_system_never_hand_ticked" CHECK("checklist_stamps"."system_check" IS NULL OR "checklist_stamps"."ticked_by" IS NULL)
);
--> statement-breakpoint
CREATE INDEX `checklist_stamps_venue_night` ON `checklist_stamps` (`venue_id`,`night`);--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_stamps_venue_night_item` ON `checklist_stamps` (`venue_id`,`night`,`item_id`);
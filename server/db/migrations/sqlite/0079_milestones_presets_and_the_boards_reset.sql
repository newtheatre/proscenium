CREATE TABLE `backstage_acknowledgements` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`device_id` text NOT NULL,
	`acknowledged_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `backstage_messages`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`device_id`) REFERENCES `backstage_devices`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backstage_acknowledgements_message_device` ON `backstage_acknowledgements` (`message_id`,`device_id`);--> statement-breakpoint
CREATE TABLE `backstage_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`night_id` text NOT NULL,
	`device_id` text NOT NULL,
	`milestone_type_id` text,
	`body` text NOT NULL,
	`supersedes_id` text,
	`composed_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`night_id`) REFERENCES `backstage_nights`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`device_id`) REFERENCES `backstage_devices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`milestone_type_id`) REFERENCES `backstage_milestone_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supersedes_id`) REFERENCES `backstage_messages`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "backstage_messages_no_self_supersede" CHECK("backstage_messages"."supersedes_id" IS NULL OR "backstage_messages"."supersedes_id" <> "backstage_messages"."id")
);
--> statement-breakpoint
CREATE INDEX `backstage_messages_night` ON `backstage_messages` (`night_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `backstage_messages_one_correction` ON `backstage_messages` (`supersedes_id`);--> statement-breakpoint
CREATE TABLE `backstage_milestone_types` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`sort` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backstage_milestone_types_label` ON `backstage_milestone_types` (`label`);--> statement-breakpoint
CREATE TABLE `backstage_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`body` text NOT NULL,
	`sort` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `backstage_devices` ADD `revoked_at` integer;--> statement-breakpoint
-- The six the story names, seeded so the board has something to call on night one (E-121
-- criterion 1). Committee-editable from there; nothing here is a static enum.
INSERT INTO backstage_milestone_types (id, label, sort) VALUES
  (lower(hex(randomblob(16))), 'Clearance', 0),
  (lower(hex(randomblob(16))), 'House open', 1),
  (lower(hex(randomblob(16))), 'Curtain up', 2),
  (lower(hex(randomblob(16))), 'Interval', 3),
  (lower(hex(randomblob(16))), 'Restart', 4),
  (lower(hex(randomblob(16))), 'End', 5);
--> statement-breakpoint
-- Never edited, only superseded (decision 0010, E-121 criterion 5).
CREATE TRIGGER backstage_messages_no_update
BEFORE UPDATE ON backstage_messages
BEGIN
  SELECT RAISE(ABORT, 'backstage_messages is never edited: post a correction instead');
END;
--> statement-breakpoint
-- A milestone is night-report data and outlives the night; only free text and presets purge
-- at 30 days, enforced at the write path too, not only here (E-122 criterion 4).
CREATE TRIGGER backstage_messages_milestone_no_delete
BEFORE DELETE ON backstage_messages
WHEN OLD.milestone_type_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'a milestone is night-report data and is never deleted');
END;
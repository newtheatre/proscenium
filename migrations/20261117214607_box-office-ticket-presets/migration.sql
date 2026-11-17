CREATE TABLE `box_office_space_ticket_presets` (
	`id` text PRIMARY KEY,
	`space_id` text NOT NULL,
	`preset_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_space_ticket_presets_preset_id_box_office_ticket_presets_id_fk` FOREIGN KEY (`preset_id`) REFERENCES `box_office_ticket_presets`(`id`)
);
--> statement-breakpoint
CREATE TABLE `box_office_ticket_presets` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`sections` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "box_office_ticket_presets_name_length" CHECK(length("name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE `box_office_bands` ADD `seats` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_space_ticket_presets_space` ON `box_office_space_ticket_presets` (`space_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_ticket_presets_name` ON `box_office_ticket_presets` (lower("name"));
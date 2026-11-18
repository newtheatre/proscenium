CREATE TABLE `box_office_seating_layouts` (
	`id` text PRIMARY KEY,
	`space_id` text NOT NULL,
	`name` text NOT NULL,
	`seats` integer,
	`wheelchair_spaces` integer DEFAULT 0 NOT NULL,
	`seats_per_space` integer DEFAULT 2 NOT NULL,
	`usual` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "box_office_seating_layouts_name_length" CHECK(length("name") BETWEEN 1 AND 80),
	CONSTRAINT "box_office_seating_layouts_numbers" CHECK(("seats" IS NULL OR "seats" >= 0) AND "wheelchair_spaces" >= 0 AND "seats_per_space" >= 0)
);
--> statement-breakpoint
ALTER TABLE `box_office_performance_sales` ADD `layout_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_seating_layouts_name` ON `box_office_seating_layouts` (`space_id`,lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_seating_layouts_usual` ON `box_office_seating_layouts` (`space_id`) WHERE usual = 1;--> statement-breakpoint
-- Written by hand, as the box office's other life-cycle triggers are (Box office specification, part
-- 3, "Wheelchair spaces"): the seats a wheelchair space takes the place of belong to its claim. Each
-- change of the space's state or expiry is made to them too, in the same statement, so every path
-- that holds, confirms, releases or exchanges a space carries its seats with it.
CREATE TRIGGER `box_office_claims_displaced_follow` AFTER UPDATE OF `state`, `expires_at` ON `box_office_claims` WHEN NEW.`displaced_for_id` IS NULL AND (NEW.`state` <> OLD.`state` OR NEW.`expires_at` IS NOT OLD.`expires_at`) BEGIN UPDATE `box_office_claims` SET `state` = NEW.`state`, `expires_at` = NEW.`expires_at`, `released_at` = NEW.`released_at`, `release_reason` = NEW.`release_reason` WHERE `displaced_for_id` = NEW.`id` AND `state` <> 'released' AND (`state` <> NEW.`state` OR `expires_at` IS NOT NEW.`expires_at`); END;

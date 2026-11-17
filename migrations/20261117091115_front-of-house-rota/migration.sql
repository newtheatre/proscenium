CREATE TABLE `front_of_house_assignments` (
	`id` text PRIMARY KEY,
	`shift_id` text NOT NULL,
	`account_id` text NOT NULL,
	`state` text NOT NULL,
	`source` text NOT NULL,
	`assigned_by` text,
	`confirmed_at` integer,
	`checked_in_at` integer,
	`checked_out_at` integer,
	`ended_at` integer,
	`ended_by` text,
	`release_reason` text,
	`minutes_worked` integer,
	`reminded` integer DEFAULT 0 NOT NULL,
	`freed_by_merge` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_assignments_shift_id_front_of_house_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `front_of_house_shifts`(`id`),
	CONSTRAINT "front_of_house_assignments_state" CHECK("state" IN ('requested', 'confirmed', 'release_requested', 'checked_in', 'worked', 'no_show', 'declined', 'withdrawn', 'released', 'removed')),
	CONSTRAINT "front_of_house_assignments_source" CHECK("source" IN ('sign-up', 'assigned', 'cover')),
	CONSTRAINT "front_of_house_assignments_reason" CHECK("release_reason" IS NULL OR length("release_reason") <= 300),
	CONSTRAINT "front_of_house_assignments_minutes" CHECK("minutes_worked" IS NULL OR "minutes_worked" >= 0)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_duties` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`is_lead` integer DEFAULT false NOT NULL,
	`call_before_minutes` integer NOT NULL,
	`stay_after_minutes` integer NOT NULL,
	`requirements` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "front_of_house_duties_name_length" CHECK(length("name") BETWEEN 1 AND 60),
	CONSTRAINT "front_of_house_duties_description" CHECK("description" IS NULL OR length("description") <= 500),
	CONSTRAINT "front_of_house_duties_call" CHECK("call_before_minutes" BETWEEN 0 AND 480),
	CONSTRAINT "front_of_house_duties_stay" CHECK("stay_after_minutes" BETWEEN 0 AND 480)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_shifts` (
	`id` text PRIMARY KEY,
	`performance_id` text,
	`venue_id` text,
	`title` text,
	`duty_id` text NOT NULL,
	`places` integer NOT NULL,
	`places_taken` integer DEFAULT 0 NOT NULL,
	`call_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`window_opens_at` integer NOT NULL,
	`window_closes_at` integer NOT NULL,
	`sign_up_closes_at` integer,
	`briefing` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`cancelled_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_shifts_duty_id_front_of_house_duties_id_fk` FOREIGN KEY (`duty_id`) REFERENCES `front_of_house_duties`(`id`),
	CONSTRAINT "front_of_house_shifts_title" CHECK(("performance_id" IS NOT NULL OR "title" IS NOT NULL) AND ("title" IS NULL OR length("title") <= 80)),
	CONSTRAINT "front_of_house_shifts_places" CHECK("places" BETWEEN 1 AND 50 AND "places_taken" BETWEEN 0 AND "places"),
	CONSTRAINT "front_of_house_shifts_times" CHECK("ends_at" > "call_at" AND "window_opens_at" <= "call_at" AND "window_closes_at" >= "ends_at"),
	CONSTRAINT "front_of_house_shifts_briefing" CHECK("briefing" IS NULL OR length("briefing") <= 1000),
	CONSTRAINT "front_of_house_shifts_state" CHECK("state" IN ('draft', 'published', 'completed', 'cancelled')),
	CONSTRAINT "front_of_house_shifts_reason" CHECK("cancelled_reason" IS NULL OR length("cancelled_reason") <= 200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_assignments_live` ON `front_of_house_assignments` (`shift_id`,`account_id`) WHERE state IN ('requested', 'confirmed', 'release_requested', 'checked_in');--> statement-breakpoint
CREATE INDEX `front_of_house_assignments_account` ON `front_of_house_assignments` (`account_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_duties_name` ON `front_of_house_duties` (`name`) WHERE archived_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_shifts_duty` ON `front_of_house_shifts` (`performance_id`,`duty_id`) WHERE performance_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `front_of_house_shifts_window` ON `front_of_house_shifts` (`state`,`window_closes_at`);
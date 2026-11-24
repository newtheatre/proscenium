CREATE TABLE `spaces_bookable_purposes` (
	`bookable_id` text NOT NULL,
	`purpose_id` text NOT NULL,
	`allowed` integer NOT NULL,
	`approval` text,
	CONSTRAINT `spaces_bookable_purposes_pk` PRIMARY KEY(`bookable_id`, `purpose_id`),
	CONSTRAINT `fk_spaces_bookable_purposes_bookable_id_spaces_bookables_id_fk` FOREIGN KEY (`bookable_id`) REFERENCES `spaces_bookables`(`id`),
	CONSTRAINT `fk_spaces_bookable_purposes_purpose_id_spaces_purposes_id_fk` FOREIGN KEY (`purpose_id`) REFERENCES `spaces_purposes`(`id`),
	CONSTRAINT "spaces_bookable_purposes_approval" CHECK("approval" IS NULL OR "approval" IN ('automatic', 'approval'))
);
--> statement-breakpoint
CREATE TABLE `spaces_bookables` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`space_id` text,
	`name` text,
	`home_venue_id` text,
	`control` text NOT NULL,
	`approval` text DEFAULT 'by-purpose' NOT NULL,
	`approval_note` text,
	`external_contact` text,
	`always_open` integer DEFAULT false NOT NULL,
	`max_length_minutes` integer,
	`guidance` text,
	`colour` text,
	`requirements` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_spaces_bookables_space_id_core_spaces_id_fk` FOREIGN KEY (`space_id`) REFERENCES `core_spaces`(`id`),
	CONSTRAINT `fk_spaces_bookables_home_venue_id_core_venues_id_fk` FOREIGN KEY (`home_venue_id`) REFERENCES `core_venues`(`id`),
	CONSTRAINT "spaces_bookables_kind" CHECK("kind" IN ('space', 'resource')),
	CONSTRAINT "spaces_bookables_space_or_name" CHECK(("kind" = 'space' AND "space_id" IS NOT NULL AND "name" IS NULL AND "home_venue_id" IS NULL) OR ("kind" = 'resource' AND "space_id" IS NULL AND "name" IS NOT NULL)),
	CONSTRAINT "spaces_bookables_control" CHECK("control" IN ('own', 'external')),
	CONSTRAINT "spaces_bookables_approval" CHECK("approval" IN ('by-purpose', 'always')),
	CONSTRAINT "spaces_bookables_state_values" CHECK("state" IN ('active', 'paused', 'archived')),
	CONSTRAINT "spaces_bookables_name_length" CHECK("name" IS NULL OR length("name") BETWEEN 1 AND 80),
	CONSTRAINT "spaces_bookables_note_length" CHECK("approval_note" IS NULL OR length("approval_note") <= 500),
	CONSTRAINT "spaces_bookables_contact" CHECK("external_contact" IS NULL OR (length("external_contact") <= 200 AND "control" = 'external')),
	CONSTRAINT "spaces_bookables_max_length" CHECK("max_length_minutes" IS NULL OR "max_length_minutes" > 0),
	CONSTRAINT "spaces_bookables_colour" CHECK("colour" IS NULL OR "colour" IN ('calendar-1', 'calendar-2', 'calendar-3', 'calendar-4', 'calendar-5', 'calendar-6', 'calendar-7', 'calendar-8'))
);
--> statement-breakpoint
CREATE TABLE `spaces_booking_events` (
	`id` text PRIMARY KEY,
	`booking_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor` text,
	`at` integer NOT NULL,
	`detail` text,
	`note` text,
	CONSTRAINT `fk_spaces_booking_events_booking_id_spaces_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `spaces_bookings`(`id`),
	CONSTRAINT "spaces_booking_events_kind" CHECK("kind" IN ('requested', 'confirmed', 'declined', 'withdrawn', 'expired', 'changed', 'cancelled', 'bumped', 'completed', 'no-show-set', 'no-show-cleared', 'external-placed', 'reminder-sent')),
	CONSTRAINT "spaces_booking_events_note" CHECK("note" IS NULL OR length("note") <= 500)
);
--> statement-breakpoint
CREATE TABLE `spaces_booking_series` (
	`id` text PRIMARY KEY,
	`bookable_id` text NOT NULL,
	`purpose_id` text NOT NULL,
	`booked_for` text NOT NULL,
	`frequency` text NOT NULL,
	`weekdays` text,
	`starts_local` text NOT NULL,
	`length_minutes` integer NOT NULL,
	`first_date` text NOT NULL,
	`last_date` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_spaces_booking_series_bookable_id_spaces_bookables_id_fk` FOREIGN KEY (`bookable_id`) REFERENCES `spaces_bookables`(`id`),
	CONSTRAINT `fk_spaces_booking_series_purpose_id_spaces_purposes_id_fk` FOREIGN KEY (`purpose_id`) REFERENCES `spaces_purposes`(`id`),
	CONSTRAINT "spaces_booking_series_frequency" CHECK("frequency" IN ('daily', 'weekly', 'fortnightly', 'monthly-by-weekday')),
	CONSTRAINT "spaces_booking_series_state" CHECK("state" IN ('active', 'ended')),
	CONSTRAINT "spaces_booking_series_length" CHECK("length_minutes" > 0),
	CONSTRAINT "spaces_booking_series_dates" CHECK("last_date" >= "first_date")
);
--> statement-breakpoint
CREATE TABLE `spaces_bookings` (
	`id` text PRIMARY KEY,
	`bookable_id` text NOT NULL,
	`purpose_id` text NOT NULL,
	`tier` integer NOT NULL,
	`series_id` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`state` text NOT NULL,
	`booked_for` text NOT NULL,
	`requested_by` text NOT NULL,
	`production_id` text,
	`origin_type` text,
	`origin_id` text,
	`title` text NOT NULL,
	`notes` text,
	`attendees` integer,
	`replaces_id` text,
	`bumps` integer DEFAULT false NOT NULL,
	`external_ref` text,
	`override_reason` text,
	`decided_by` text,
	`decided_at` integer,
	`decision_note` text,
	`closed_reason` text,
	`bumped_by_id` text,
	`late_cancel` integer DEFAULT false NOT NULL,
	`no_show` integer DEFAULT false NOT NULL,
	`reminded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_spaces_bookings_bookable_id_spaces_bookables_id_fk` FOREIGN KEY (`bookable_id`) REFERENCES `spaces_bookables`(`id`),
	CONSTRAINT `fk_spaces_bookings_purpose_id_spaces_purposes_id_fk` FOREIGN KEY (`purpose_id`) REFERENCES `spaces_purposes`(`id`),
	CONSTRAINT `fk_spaces_bookings_series_id_spaces_booking_series_id_fk` FOREIGN KEY (`series_id`) REFERENCES `spaces_booking_series`(`id`),
	CONSTRAINT `fk_spaces_bookings_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`),
	CONSTRAINT "spaces_bookings_state_values" CHECK("state" IN ('requested', 'confirmed', 'declined', 'withdrawn', 'expired', 'cancelled', 'bumped', 'completed')),
	CONSTRAINT "spaces_bookings_times" CHECK("ends_at" > "starts_at"),
	CONSTRAINT "spaces_bookings_origin_pair" CHECK(("origin_type" IS NULL) = ("origin_id" IS NULL)),
	CONSTRAINT "spaces_bookings_title" CHECK(length("title") BETWEEN 3 AND 120),
	CONSTRAINT "spaces_bookings_notes" CHECK("notes" IS NULL OR length("notes") <= 1000),
	CONSTRAINT "spaces_bookings_attendees" CHECK("attendees" IS NULL OR "attendees" > 0),
	CONSTRAINT "spaces_bookings_external_ref" CHECK("external_ref" IS NULL OR length("external_ref") <= 120),
	CONSTRAINT "spaces_bookings_override" CHECK("override_reason" IS NULL OR length("override_reason") <= 300),
	CONSTRAINT "spaces_bookings_decision_note" CHECK("decision_note" IS NULL OR length("decision_note") <= 500),
	CONSTRAINT "spaces_bookings_closed_reason" CHECK("closed_reason" IS NULL OR "closed_reason" IN ('by-booker', 'by-staff', 'performance', 'closure', 'higher-tier', 'bookable-removed', 'origin-removed')),
	CONSTRAINT "spaces_bookings_no_show" CHECK("no_show" = 0 OR "state" = 'completed')
);
--> statement-breakpoint
CREATE TABLE `spaces_opening_hours` (
	`bookable_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`opens_at` text NOT NULL,
	`closes_at` text NOT NULL,
	CONSTRAINT `spaces_opening_hours_pk` PRIMARY KEY(`bookable_id`, `weekday`, `opens_at`),
	CONSTRAINT `fk_spaces_opening_hours_bookable_id_spaces_bookables_id_fk` FOREIGN KEY (`bookable_id`) REFERENCES `spaces_bookables`(`id`),
	CONSTRAINT "spaces_opening_hours_weekday" CHECK("weekday" BETWEEN 1 AND 7),
	CONSTRAINT "spaces_opening_hours_times" CHECK("opens_at" GLOB '[0-2][0-9]:[0-5][0-9]' AND "closes_at" GLOB '[0-2][0-9]:[0-5][0-9]' AND "closes_at" > "opens_at" AND "closes_at" <= '24:00')
);
--> statement-breakpoint
CREATE TABLE `spaces_purposes` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`tier` integer NOT NULL,
	`open_to` text NOT NULL,
	`needs_production` integer DEFAULT false NOT NULL,
	`approval` text DEFAULT 'automatic' NOT NULL,
	`max_length_minutes` integer,
	`max_ahead_days` integer,
	`min_notice_minutes` integer,
	`may_repeat` integer DEFAULT true NOT NULL,
	`can_be_bumped` integer DEFAULT true NOT NULL,
	`requirements` text DEFAULT '[]' NOT NULL,
	`description` text,
	`state` text DEFAULT 'active' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "spaces_purposes_tier" CHECK("tier" BETWEEN 1 AND 9),
	CONSTRAINT "spaces_purposes_open_to" CHECK("open_to" IN ('bookers', 'production-team', 'staff')),
	CONSTRAINT "spaces_purposes_team_needs_production" CHECK("open_to" != 'production-team' OR "needs_production" = 1),
	CONSTRAINT "spaces_purposes_approval" CHECK("approval" IN ('automatic', 'approval')),
	CONSTRAINT "spaces_purposes_state_values" CHECK("state" IN ('active', 'retired')),
	CONSTRAINT "spaces_purposes_name_length" CHECK(length("name") BETWEEN 1 AND 60),
	CONSTRAINT "spaces_purposes_description" CHECK("description" IS NULL OR length("description") <= 300),
	CONSTRAINT "spaces_purposes_limits" CHECK(("max_length_minutes" IS NULL OR "max_length_minutes" > 0) AND ("max_ahead_days" IS NULL OR "max_ahead_days" > 0) AND ("min_notice_minutes" IS NULL OR "min_notice_minutes" >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_bookables_space` ON `spaces_bookables` (`space_id`) WHERE space_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_bookables_resource_name` ON `spaces_bookables` (lower("name")) WHERE kind = 'resource';--> statement-breakpoint
CREATE INDEX `spaces_bookables_state` ON `spaces_bookables` (`state`,`sort`);--> statement-breakpoint
CREATE INDEX `spaces_booking_events_booking` ON `spaces_booking_events` (`booking_id`,`at`);--> statement-breakpoint
CREATE INDEX `spaces_booking_series_for` ON `spaces_booking_series` (`booked_for`,`state`);--> statement-breakpoint
CREATE INDEX `spaces_bookings_clash` ON `spaces_bookings` (`bookable_id`,`state`,`starts_at`);--> statement-breakpoint
CREATE INDEX `spaces_bookings_for` ON `spaces_bookings` (`booked_for`,`starts_at`);--> statement-breakpoint
CREATE INDEX `spaces_bookings_state` ON `spaces_bookings` (`state`,`starts_at`);--> statement-breakpoint
CREATE INDEX `spaces_bookings_series` ON `spaces_bookings` (`series_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `spaces_bookings_production` ON `spaces_bookings` (`production_id`,`starts_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_bookings_origin` ON `spaces_bookings` (`origin_type`,`origin_id`) WHERE origin_type IS NOT NULL AND state IN ('requested', 'confirmed');--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_purposes_slug` ON `spaces_purposes` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_purposes_name` ON `spaces_purposes` (lower("name"));--> statement-breakpoint
CREATE INDEX `spaces_purposes_order` ON `spaces_purposes` (`state`,`tier`,`sort`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `spaces_booking_events_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `spaces_booking_events_append_only_delete` BEFORE DELETE ON `spaces_booking_events` BEGIN SELECT RAISE(ABORT, 'append-only: spaces_booking_events'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `spaces_booking_events_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `spaces_booking_events_append_only_update` BEFORE UPDATE ON `spaces_booking_events` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`booking_id` IS OLD.`booking_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`actor` IS OLD.`actor` AND NEW.`at` IS OLD.`at` AND NEW.`detail` IS OLD.`detail` AND (NEW.`note` IS OLD.`note` OR NEW.`note` IS '[removed]')) BEGIN SELECT RAISE(ABORT, 'append-only: spaces_booking_events'); END;

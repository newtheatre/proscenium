CREATE TABLE `availability_meeting_invitees` (
	`id` text PRIMARY KEY,
	`meeting_id` text NOT NULL,
	`account_id` text NOT NULL,
	`response` text DEFAULT 'pending' NOT NULL,
	`responded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_availability_meeting_invitees_meeting_id_availability_meetings_id_fk` FOREIGN KEY (`meeting_id`) REFERENCES `availability_meetings`(`id`),
	CONSTRAINT "availability_meeting_invitees_response" CHECK("response" IN ('pending', 'going', 'not-going'))
);
--> statement-breakpoint
CREATE TABLE `availability_meetings` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`place` text,
	`space_booking_ref` text,
	`context_ref` text,
	`notes` text,
	`arranged_by` text NOT NULL,
	`find_id` text,
	`state` text DEFAULT 'arranged' NOT NULL,
	`cancelled_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_availability_meetings_find_id_availability_finds_id_fk` FOREIGN KEY (`find_id`) REFERENCES `availability_finds`(`id`),
	CONSTRAINT "availability_meetings_title" CHECK(length("title") BETWEEN 1 AND 80),
	CONSTRAINT "availability_meetings_length" CHECK("ends_at" > "starts_at" AND "ends_at" - "starts_at" <= 86400000),
	CONSTRAINT "availability_meetings_place" CHECK("place" IS NULL OR length("place") <= 120),
	CONSTRAINT "availability_meetings_notes" CHECK("notes" IS NULL OR length("notes") <= 2000),
	CONSTRAINT "availability_meetings_reason" CHECK("cancelled_reason" IS NULL OR length("cancelled_reason") <= 200),
	CONSTRAINT "availability_meetings_state_values" CHECK("state" IN ('arranged', 'cancelled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `availability_meeting_invitees_once` ON `availability_meeting_invitees` (`meeting_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `availability_meeting_invitees_account` ON `availability_meeting_invitees` (`account_id`,`response`);--> statement-breakpoint
CREATE INDEX `availability_meetings_time` ON `availability_meetings` (`state`,`starts_at`);--> statement-breakpoint
CREATE INDEX `availability_meetings_arranged_by` ON `availability_meetings` (`arranged_by`);
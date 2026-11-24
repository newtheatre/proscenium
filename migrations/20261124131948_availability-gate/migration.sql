CREATE TABLE `availability_exceptions` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`first_date` text NOT NULL,
	`last_date` text NOT NULL,
	`weekdays` text,
	`from_local` text,
	`until_local` text,
	`level` text NOT NULL,
	`reason` text,
	`reason_shared` integer DEFAULT false NOT NULL,
	`entered_by` text NOT NULL,
	`request_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_availability_exceptions_request_id_availability_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `availability_requests`(`id`),
	CONSTRAINT "availability_exceptions_dates" CHECK("last_date" >= "first_date" AND julianday("last_date") - julianday("first_date") <= 366),
	CONSTRAINT "availability_exceptions_times" CHECK(("from_local" IS NULL AND "until_local" IS NULL) OR (("from_local" GLOB '[0-2][0-9]:[0-5][0-9]' AND "from_local" <= '24:00') AND ("until_local" GLOB '[0-2][0-9]:[0-5][0-9]' AND "until_local" <= '24:00') AND "until_local" > "from_local")),
	CONSTRAINT "availability_exceptions_level" CHECK("level" IN ('free', 'maybe', 'busy')),
	CONSTRAINT "availability_exceptions_reason" CHECK("reason" IS NULL OR length("reason") <= 300)
);
--> statement-breakpoint
CREATE TABLE `availability_pattern_lines` (
	`id` text PRIMARY KEY,
	`pattern_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`from_local` text NOT NULL,
	`until_local` text NOT NULL,
	`level` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_availability_pattern_lines_pattern_id_availability_patterns_id_fk` FOREIGN KEY (`pattern_id`) REFERENCES `availability_patterns`(`id`),
	CONSTRAINT "availability_pattern_lines_weekday" CHECK("weekday" BETWEEN 1 AND 7),
	CONSTRAINT "availability_pattern_lines_times" CHECK(("from_local" GLOB '[0-2][0-9]:[0-5][0-9]' AND "from_local" <= '24:00') AND ("until_local" GLOB '[0-2][0-9]:[0-5][0-9]' AND "until_local" <= '24:00') AND "until_local" > "from_local"),
	CONSTRAINT "availability_pattern_lines_level" CHECK("level" IN ('free', 'maybe', 'busy'))
);
--> statement-breakpoint
CREATE TABLE `availability_patterns` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`label` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "availability_patterns_label" CHECK(length("label") BETWEEN 1 AND 40),
	CONSTRAINT "availability_patterns_dates" CHECK("ends_on" IS NULL OR "ends_on" >= "starts_on")
);
--> statement-breakpoint
CREATE TABLE `availability_profiles` (
	`account_id` text PRIMARY KEY NOT NULL,
	`unmarked_means` text,
	`changed_at` integer NOT NULL,
	`checked_to` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "availability_profiles_unmarked" CHECK("unmarked_means" IS NULL OR "unmarked_means" IN ('unknown', 'free'))
);
--> statement-breakpoint
CREATE TABLE `availability_request_people` (
	`id` text PRIMARY KEY,
	`request_id` text NOT NULL,
	`account_id` text NOT NULL,
	`state` text DEFAULT 'asked' NOT NULL,
	`answered_at` integer,
	`reminders_sent` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_availability_request_people_request_id_availability_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `availability_requests`(`id`),
	CONSTRAINT "availability_request_people_state" CHECK("state" IN ('asked', 'answered', 'lapsed', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE `availability_requests` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`message` text,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`due_on` text NOT NULL,
	`group_refs` text DEFAULT '[]' NOT NULL,
	`source_ref` text,
	`opened_by` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "availability_requests_title" CHECK(length("title") BETWEEN 1 AND 80),
	CONSTRAINT "availability_requests_message" CHECK("message" IS NULL OR length("message") <= 1000),
	CONSTRAINT "availability_requests_dates" CHECK("to_date" >= "from_date" AND julianday("to_date") - julianday("from_date") <= 366),
	CONSTRAINT "availability_requests_state_values" CHECK("state" IN ('open', 'closed'))
);
--> statement-breakpoint
CREATE INDEX `availability_exceptions_account` ON `availability_exceptions` (`account_id`,`last_date`);--> statement-breakpoint
CREATE INDEX `availability_pattern_lines_pattern` ON `availability_pattern_lines` (`pattern_id`,`weekday`,`from_local`);--> statement-breakpoint
CREATE INDEX `availability_patterns_account` ON `availability_patterns` (`account_id`,`starts_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `availability_request_people_once` ON `availability_request_people` (`request_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `availability_request_people_account` ON `availability_request_people` (`account_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `availability_requests_source` ON `availability_requests` (`source_ref`) WHERE source_ref IS NOT NULL AND state = 'open';--> statement-breakpoint
CREATE INDEX `availability_requests_state` ON `availability_requests` (`state`,`due_on`);
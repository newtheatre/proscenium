CREATE TABLE `availability_find_people` (
	`find_id` text NOT NULL,
	`account_id` text NOT NULL,
	`must_have` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `availability_find_people_pk` PRIMARY KEY(`find_id`, `account_id`),
	CONSTRAINT `fk_availability_find_people_find_id_availability_finds_id_fk` FOREIGN KEY (`find_id`) REFERENCES `availability_finds`(`id`)
);
--> statement-breakpoint
CREATE TABLE `availability_find_slots` (
	`id` text PRIMARY KEY,
	`find_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_availability_find_slots_find_id_availability_finds_id_fk` FOREIGN KEY (`find_id`) REFERENCES `availability_finds`(`id`),
	CONSTRAINT "availability_find_slots_order" CHECK("ends_at" > "starts_at")
);
--> statement-breakpoint
CREATE TABLE `availability_find_votes` (
	`id` text PRIMARY KEY,
	`slot_id` text NOT NULL,
	`account_id` text NOT NULL,
	`answer` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_availability_find_votes_slot_id_availability_find_slots_id_fk` FOREIGN KEY (`slot_id`) REFERENCES `availability_find_slots`(`id`),
	CONSTRAINT "availability_find_votes_answer" CHECK("answer" IN ('yes', 'if-need-be', 'no'))
);
--> statement-breakpoint
CREATE TABLE `availability_finds` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`length_minutes` integer NOT NULL,
	`group_refs` text DEFAULT '[]' NOT NULL,
	`space_ids` text DEFAULT '[]' NOT NULL,
	`context_ref` text,
	`target_id` text,
	`created_by` text NOT NULL,
	`answers_by` integer NOT NULL,
	`state` text DEFAULT 'polling' NOT NULL,
	`decided_slot_id` text,
	`outcome_ref` text,
	`decided_at` integer,
	`abandoned_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "availability_finds_title" CHECK(length("title") BETWEEN 1 AND 80),
	CONSTRAINT "availability_finds_length" CHECK("length_minutes" BETWEEN 15 AND 720),
	CONSTRAINT "availability_finds_state_values" CHECK("state" IN ('polling', 'decided', 'abandoned'))
);
--> statement-breakpoint
CREATE INDEX `availability_find_people_account` ON `availability_find_people` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `availability_find_slots_once` ON `availability_find_slots` (`find_id`,`starts_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `availability_find_votes_once` ON `availability_find_votes` (`slot_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `availability_find_votes_account` ON `availability_find_votes` (`account_id`);--> statement-breakpoint
CREATE INDEX `availability_finds_state` ON `availability_finds` (`state`,`answers_by`);--> statement-breakpoint
CREATE INDEX `availability_finds_created_by` ON `availability_finds` (`created_by`);
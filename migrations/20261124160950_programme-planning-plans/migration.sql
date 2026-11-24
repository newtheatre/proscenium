CREATE TABLE `programme_planning_entries` (
	`id` text PRIMARY KEY,
	`plan_id` text NOT NULL,
	`source` text NOT NULL,
	`source_ref` text,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`category_term_id` text,
	`state` text DEFAULT 'candidate' NOT NULL,
	`production_id` text,
	`company_id` text,
	`applicant_account_id` text,
	`minutes` integer,
	`get_in_minutes` integer DEFAULT 0 NOT NULL,
	`get_out_minutes` integer DEFAULT 0 NOT NULL,
	`performances_wanted` integer DEFAULT 1 NOT NULL,
	`shape` text DEFAULT 'timed' NOT NULL,
	`rights_status` text DEFAULT 'unknown' NOT NULL,
	`collection_ids` text DEFAULT '[]' NOT NULL,
	`staff_note` text,
	`decided_at` integer,
	`withdrawn_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_programme_planning_entries_plan_id_programme_planning_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `programme_planning_plans`(`id`),
	CONSTRAINT `fk_programme_planning_entries_category_term_id_core_terms_id_fk` FOREIGN KEY (`category_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT `fk_programme_planning_entries_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`),
	CONSTRAINT "programme_planning_entries_source" CHECK("source" IN ('call', 'manual', 'companies', 'import')),
	CONSTRAINT "programme_planning_entries_kind" CHECK("kind" IN ('own', 'visiting', 'hire', 'event')),
	CONSTRAINT "programme_planning_entries_state" CHECK("state" IN ('candidate', 'accepted', 'declined', 'withdrawn')),
	CONSTRAINT "programme_planning_entries_shape" CHECK("shape" IN ('timed', 'drop-in')),
	CONSTRAINT "programme_planning_entries_rights" CHECK("rights_status" IN ('none-needed', 'needed', 'held-by-company', 'unknown')),
	CONSTRAINT "programme_planning_entries_withdrawn" CHECK("withdrawn_reason" IS NULL OR "withdrawn_reason" IN ('applicant', 'staff', 'production-cancelled', 'retention')),
	CONSTRAINT "programme_planning_entries_title" CHECK(length("title") BETWEEN 1 AND 200),
	CONSTRAINT "programme_planning_entries_source_ref_length" CHECK("source_ref" IS NULL OR length("source_ref") <= 80),
	CONSTRAINT "programme_planning_entries_minutes" CHECK("minutes" IS NULL OR "minutes" BETWEEN 1 AND 1440),
	CONSTRAINT "programme_planning_entries_get_in" CHECK("get_in_minutes" BETWEEN 0 AND 720 AND "get_out_minutes" BETWEEN 0 AND 720),
	CONSTRAINT "programme_planning_entries_wanted" CHECK("performances_wanted" BETWEEN 1 AND 60),
	CONSTRAINT "programme_planning_entries_note" CHECK("staff_note" IS NULL OR length("staff_note") <= 2000),
	CONSTRAINT "programme_planning_entries_accepted" CHECK(("state" = 'accepted') = ("production_id" IS NOT NULL) OR "state" = 'withdrawn')
);
--> statement-breakpoint
CREATE TABLE `programme_planning_placements` (
	`performance_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`line_up_item_id` text,
	`offered_slot_id` text,
	`told_fingerprint` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `programme_planning_placements_pk` PRIMARY KEY(`performance_id`, `entry_id`),
	CONSTRAINT `fk_programme_planning_placements_performance_id_core_performances_id_fk` FOREIGN KEY (`performance_id`) REFERENCES `core_performances`(`id`),
	CONSTRAINT `fk_programme_planning_placements_entry_id_programme_planning_entries_id_fk` FOREIGN KEY (`entry_id`) REFERENCES `programme_planning_entries`(`id`),
	CONSTRAINT "programme_planning_placements_fingerprint" CHECK("told_fingerprint" IS NULL OR length("told_fingerprint") <= 64)
);
--> statement-breakpoint
CREATE TABLE `programme_planning_plans` (
	`id` text PRIMARY KEY,
	`season_id` text NOT NULL,
	`state` text DEFAULT 'planning' NOT NULL,
	`board_from` text NOT NULL,
	`board_to` text NOT NULL,
	`day_starts` text DEFAULT '09:00' NOT NULL,
	`day_ends` text DEFAULT '00:00' NOT NULL,
	`call_opens_at` integer,
	`call_closes_at` integer,
	`publish_productions` integer NOT NULL,
	`published_at` integer,
	`published_by` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_programme_planning_plans_season_id_core_seasons_id_fk` FOREIGN KEY (`season_id`) REFERENCES `core_seasons`(`id`),
	CONSTRAINT "programme_planning_plans_state" CHECK("state" IN ('planning', 'published', 'closed')),
	CONSTRAINT "programme_planning_plans_board" CHECK("board_to" >= "board_from"),
	CONSTRAINT "programme_planning_plans_hours" CHECK(("day_starts" GLOB '[0-2][0-9]:[0-5][0-9]' AND "day_starts" <= '24:00') AND ("day_ends" GLOB '[0-2][0-9]:[0-5][0-9]' AND "day_ends" <= '24:00') AND ("day_ends" > "day_starts" OR "day_ends" = '00:00')),
	CONSTRAINT "programme_planning_plans_call" CHECK("call_closes_at" IS NULL OR "call_opens_at" IS NULL OR "call_closes_at" > "call_opens_at")
);
--> statement-breakpoint
CREATE INDEX `programme_planning_entries_plan` ON `programme_planning_entries` (`plan_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `programme_planning_entries_production` ON `programme_planning_entries` (`production_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `programme_planning_entries_source_ref` ON `programme_planning_entries` (`source_ref`) WHERE "programme_planning_entries"."source_ref" IS NOT NULL AND "programme_planning_entries"."state" IN ('candidate', 'accepted');--> statement-breakpoint
CREATE INDEX `programme_planning_placements_entry` ON `programme_planning_placements` (`entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `programme_planning_plans_season` ON `programme_planning_plans` (`season_id`);
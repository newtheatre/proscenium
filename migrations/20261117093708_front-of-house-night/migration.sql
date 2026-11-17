CREATE TABLE `front_of_house_checklist_entries` (
	`id` text PRIMARY KEY,
	`run_id` text NOT NULL,
	`item_id` text NOT NULL,
	`label` text NOT NULL,
	`outcome` text NOT NULL,
	`reading` integer,
	`reason_code` text,
	`reason_note` text,
	`done_by` text NOT NULL,
	`done_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_checklist_entries_run_id_front_of_house_checklist_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `front_of_house_checklist_runs`(`id`),
	CONSTRAINT `fk_front_of_house_checklist_entries_item_id_front_of_house_checklist_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `front_of_house_checklist_items`(`id`),
	CONSTRAINT `fk_front_of_house_checklist_entries_reason_code_core_terms_id_fk` FOREIGN KEY (`reason_code`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "front_of_house_checklist_entries_outcome" CHECK("outcome" IN ('done', 'exception', 'not_applicable')),
	CONSTRAINT "front_of_house_checklist_entries_reason" CHECK("outcome" <> 'exception' OR "reason_code" IS NOT NULL),
	CONSTRAINT "front_of_house_checklist_entries_note" CHECK("reason_note" IS NULL OR length("reason_note") <= 200)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_checklist_items` (
	`id` text PRIMARY KEY,
	`checklist_id` text NOT NULL,
	`label` text NOT NULL,
	`help` text,
	`kind` text DEFAULT 'tick' NOT NULL,
	`unit` text,
	`required` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_checklist_items_checklist_id_front_of_house_checklists_id_fk` FOREIGN KEY (`checklist_id`) REFERENCES `front_of_house_checklists`(`id`),
	CONSTRAINT "front_of_house_checklist_items_label" CHECK(length("label") BETWEEN 1 AND 160),
	CONSTRAINT "front_of_house_checklist_items_help" CHECK("help" IS NULL OR length("help") <= 500),
	CONSTRAINT "front_of_house_checklist_items_kind" CHECK("kind" IN ('tick', 'reading')),
	CONSTRAINT "front_of_house_checklist_items_unit" CHECK("unit" IS NULL OR ("kind" = 'reading' AND length("unit") <= 20))
);
--> statement-breakpoint
CREATE TABLE `front_of_house_checklist_runs` (
	`id` text PRIMARY KEY,
	`checklist_id` text NOT NULL,
	`performance_id` text,
	`venue_id` text,
	`local_date` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`completed_by` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_checklist_runs_checklist_id_front_of_house_checklists_id_fk` FOREIGN KEY (`checklist_id`) REFERENCES `front_of_house_checklists`(`id`),
	CONSTRAINT "front_of_house_checklist_runs_state" CHECK("state" IN ('open', 'complete', 'complete_with_exceptions'))
);
--> statement-breakpoint
CREATE TABLE `front_of_house_checklists` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`moment` text NOT NULL,
	`venue_id` text,
	`duty_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_checklists_duty_id_front_of_house_duties_id_fk` FOREIGN KEY (`duty_id`) REFERENCES `front_of_house_duties`(`id`),
	CONSTRAINT "front_of_house_checklists_name" CHECK(length("name") BETWEEN 1 AND 80),
	CONSTRAINT "front_of_house_checklists_moment" CHECK("moment" IN ('pre-show', 'post-show', 'other'))
);
--> statement-breakpoint
CREATE TABLE `front_of_house_emergency_cards` (
	`id` text PRIMARY KEY,
	`venue_id` text NOT NULL,
	`body` text NOT NULL,
	`reviewed_on` text NOT NULL,
	`reviewed_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "front_of_house_emergency_cards_body" CHECK(length("body") BETWEEN 1 AND 8000)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_timings` (
	`id` text PRIMARY KEY,
	`performance_id` text NOT NULL,
	`kind` text NOT NULL,
	`at` integer NOT NULL,
	`recorded_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "front_of_house_timings_kind_check" CHECK("kind" IN ('house_open', 'curtain_up', 'interval_start', 'interval_end', 'curtain_down', 'house_clear'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_checklist_entries_item` ON `front_of_house_checklist_entries` (`run_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `front_of_house_checklist_items_list` ON `front_of_house_checklist_items` (`checklist_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_checklist_runs_performance` ON `front_of_house_checklist_runs` (`checklist_id`,`performance_id`) WHERE performance_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_checklist_runs_day` ON `front_of_house_checklist_runs` (`checklist_id`,coalesce("venue_id", ''),`local_date`) WHERE performance_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_emergency_cards_venue` ON `front_of_house_emergency_cards` (`venue_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_timings_kind` ON `front_of_house_timings` (`performance_id`,`kind`);
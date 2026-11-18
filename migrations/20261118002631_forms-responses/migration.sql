CREATE TABLE `forms_answers` (
	`response_id` text NOT NULL,
	`revision` integer NOT NULL,
	`question_id` text NOT NULL,
	`repeat_index` integer DEFAULT 0 NOT NULL,
	`data_class` text NOT NULL,
	`value_text` text,
	`value_number` real,
	`value_json` text,
	`other_text` text,
	`value_cipher` text,
	`label_snapshot` text,
	CONSTRAINT `forms_answers_pk` PRIMARY KEY(`response_id`, `revision`, `question_id`, `repeat_index`),
	CONSTRAINT `fk_forms_answers_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`),
	CONSTRAINT "forms_answers_class" CHECK("data_class" IN ('public', 'internal', 'personal', 'free-text', 'special'))
);
--> statement-breakpoint
CREATE TABLE `forms_placements` (
	`id` text PRIMARY KEY,
	`form_id` text NOT NULL,
	`slot_key` text NOT NULL,
	`subject_type` text,
	`subject_id` text,
	`audience` text DEFAULT 'anyone' NOT NULL,
	`audience_role` text,
	`opens_at` integer,
	`closes_at` integer,
	`response_cap` integer,
	`response_count` integer DEFAULT 0 NOT NULL,
	`one_per_person` integer DEFAULT false NOT NULL,
	`edit_after_submit` text DEFAULT 'never' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_forms_placements_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`),
	CONSTRAINT "forms_placements_audience" CHECK("audience" IN ('anyone', 'signed_in', 'members', 'role', 'invited')),
	CONSTRAINT "forms_placements_edit" CHECK("edit_after_submit" IN ('never', 'until_close', 'when_returned')),
	CONSTRAINT "forms_placements_status" CHECK("status" IN ('active', 'paused', 'ended')),
	CONSTRAINT "forms_placements_cap" CHECK("response_cap" IS NULL OR "response_count" <= "response_cap"),
	CONSTRAINT "forms_placements_count" CHECK("response_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `forms_response_drafts` (
	`response_id` text PRIMARY KEY NOT NULL,
	`answers_cipher` text,
	`page_id` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_forms_response_drafts_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`)
);
--> statement-breakpoint
CREATE TABLE `forms_responses` (
	`id` text PRIMARY KEY,
	`reference` text NOT NULL,
	`form_id` text NOT NULL,
	`version_id` text NOT NULL,
	`placement_id` text NOT NULL,
	`subject_type` text,
	`subject_id` text,
	`realm` text NOT NULL,
	`person_id` text,
	`respondent_email` text,
	`entered_by` text,
	`state` text NOT NULL,
	`stage_key` text,
	`stage_kind` text,
	`current_revision` integer DEFAULT 0 NOT NULL,
	`unique_key` text,
	`calculated` text,
	`is_test` integer DEFAULT false NOT NULL,
	`submitted_at` integer,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`retention_due_at` integer,
	`anonymised_at` integer,
	CONSTRAINT `fk_forms_responses_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`),
	CONSTRAINT `fk_forms_responses_version_id_forms_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `forms_versions`(`id`),
	CONSTRAINT `fk_forms_responses_placement_id_forms_placements_id_fk` FOREIGN KEY (`placement_id`) REFERENCES `forms_placements`(`id`),
	CONSTRAINT "forms_responses_state" CHECK("state" IN ('draft', 'awaiting_payment', 'submitted', 'withdrawn')),
	CONSTRAINT "forms_responses_stage" CHECK("stage_kind" IS NULL OR "stage_kind" IN ('pending', 'in_review', 'returned', 'approved', 'declined', 'closed')),
	CONSTRAINT "forms_responses_realm" CHECK("realm" IN ('audience', 'members'))
);
--> statement-breakpoint
CREATE INDEX `forms_answers_text` ON `forms_answers` (`question_id`,`value_text`);--> statement-breakpoint
CREATE INDEX `forms_answers_number` ON `forms_answers` (`question_id`,`value_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_placements_place` ON `forms_placements` (`slot_key`,`subject_type`,`subject_id`,`form_id`);--> statement-breakpoint
CREATE INDEX `forms_placements_form` ON `forms_placements` (`form_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_responses_reference` ON `forms_responses` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_responses_unique` ON `forms_responses` (`placement_id`,`unique_key`);--> statement-breakpoint
CREATE INDEX `forms_responses_form` ON `forms_responses` (`form_id`,`state`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `forms_responses_person` ON `forms_responses` (`person_id`);--> statement-breakpoint
CREATE INDEX `forms_responses_retention` ON `forms_responses` (`retention_due_at`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `forms_answers_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `forms_answers_append_only_delete` BEFORE DELETE ON `forms_answers` BEGIN SELECT RAISE(ABORT, 'append-only: forms_answers'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `forms_answers_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `forms_answers_append_only_update` BEFORE UPDATE ON `forms_answers` WHEN NOT (NEW.`response_id` IS OLD.`response_id` AND NEW.`revision` IS OLD.`revision` AND NEW.`question_id` IS OLD.`question_id` AND NEW.`repeat_index` IS OLD.`repeat_index` AND NEW.`data_class` IS OLD.`data_class` AND (NEW.`value_text` IS OLD.`value_text` OR NEW.`value_text` IS NULL OR NEW.`value_text` IN ('Former member', '[removed]')) AND (NEW.`value_number` IS OLD.`value_number` OR NEW.`value_number` IS NULL OR NEW.`value_number` IN ('Former member', '[removed]')) AND (NEW.`value_json` IS OLD.`value_json` OR NEW.`value_json` IS NULL OR NEW.`value_json` IN ('Former member', '[removed]')) AND (NEW.`other_text` IS OLD.`other_text` OR NEW.`other_text` IS NULL OR NEW.`other_text` IN ('Former member', '[removed]')) AND (NEW.`value_cipher` IS OLD.`value_cipher` OR NEW.`value_cipher` IS NULL) AND (NEW.`label_snapshot` IS OLD.`label_snapshot` OR NEW.`label_snapshot` IS NULL OR NEW.`label_snapshot` IN ('Former member', '[removed]'))) BEGIN SELECT RAISE(ABORT, 'append-only: forms_answers'); END;

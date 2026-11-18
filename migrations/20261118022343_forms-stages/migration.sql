CREATE TABLE `forms_stage_history` (
	`id` text PRIMARY KEY,
	`response_id` text NOT NULL,
	`from_stage` text,
	`to_stage` text NOT NULL,
	`to_kind` text NOT NULL,
	`transition_key` text NOT NULL,
	`revision` integer NOT NULL,
	`actor_id` text,
	`at` integer NOT NULL,
	CONSTRAINT `fk_forms_stage_history_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`),
	CONSTRAINT "forms_stage_history_kind" CHECK("to_kind" IN ('pending', 'in_review', 'returned', 'approved', 'declined', 'closed'))
);
--> statement-breakpoint
ALTER TABLE `forms_responses` ADD `stage_note` text;--> statement-breakpoint
CREATE INDEX `forms_stage_history_response` ON `forms_stage_history` (`response_id`,`at`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `forms_stage_history_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `forms_stage_history_append_only_delete` BEFORE DELETE ON `forms_stage_history` BEGIN SELECT RAISE(ABORT, 'append-only: forms_stage_history'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `forms_stage_history_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `forms_stage_history_append_only_update` BEFORE UPDATE ON `forms_stage_history` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`response_id` IS OLD.`response_id` AND NEW.`from_stage` IS OLD.`from_stage` AND NEW.`to_stage` IS OLD.`to_stage` AND NEW.`to_kind` IS OLD.`to_kind` AND NEW.`transition_key` IS OLD.`transition_key` AND NEW.`revision` IS OLD.`revision` AND NEW.`actor_id` IS OLD.`actor_id` AND NEW.`at` IS OLD.`at`) BEGIN SELECT RAISE(ABORT, 'append-only: forms_stage_history'); END;

CREATE TABLE `forms_stage_notes` (
	`id` text PRIMARY KEY,
	`response_id` text NOT NULL,
	`at` integer NOT NULL,
	`note` text,
	CONSTRAINT `fk_forms_stage_notes_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`)
);
--> statement-breakpoint
ALTER TABLE `forms_forms` ADD `allow_edits` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `forms_stage_notes_response` ON `forms_stage_notes` (`response_id`,`at`);
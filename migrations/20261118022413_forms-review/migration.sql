CREATE TABLE `forms_review_assignments` (
	`id` text PRIMARY KEY,
	`round_id` text NOT NULL,
	`response_id` text NOT NULL,
	`form_id` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`status` text DEFAULT 'assigned' NOT NULL,
	`conflict` text,
	`vote` text,
	`scores` text,
	`comment` text,
	`submitted_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_forms_review_assignments_round_id_forms_review_rounds_id_fk` FOREIGN KEY (`round_id`) REFERENCES `forms_review_rounds`(`id`),
	CONSTRAINT `fk_forms_review_assignments_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`),
	CONSTRAINT `fk_forms_review_assignments_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`),
	CONSTRAINT "forms_review_assignments_status" CHECK("status" IN ('assigned', 'submitted', 'conflicted')),
	CONSTRAINT "forms_review_assignments_conflict" CHECK("conflict" IS NULL OR "conflict" IN ('declared', 'automatic')),
	CONSTRAINT "forms_review_assignments_vote" CHECK("vote" IS NULL OR "vote" IN ('for', 'against', 'abstain'))
);
--> statement-breakpoint
CREATE TABLE `forms_review_rounds` (
	`id` text PRIMARY KEY,
	`response_id` text NOT NULL,
	`form_id` text NOT NULL,
	`stage_key` text NOT NULL,
	`revision` integer NOT NULL,
	`opened_at` integer NOT NULL,
	`released_at` integer,
	`released_by` text,
	`closed_at` integer,
	CONSTRAINT `fk_forms_review_rounds_response_id_forms_responses_id_fk` FOREIGN KEY (`response_id`) REFERENCES `forms_responses`(`id`),
	CONSTRAINT `fk_forms_review_rounds_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`)
);
--> statement-breakpoint
ALTER TABLE `forms_responses` ADD `decision_reason` text;--> statement-breakpoint
CREATE UNIQUE INDEX `forms_review_assignments_one` ON `forms_review_assignments` (`round_id`,`reviewer_id`);--> statement-breakpoint
CREATE INDEX `forms_review_assignments_reviewer` ON `forms_review_assignments` (`reviewer_id`,`status`);--> statement-breakpoint
CREATE INDEX `forms_review_assignments_response` ON `forms_review_assignments` (`response_id`);--> statement-breakpoint
CREATE INDEX `forms_review_rounds_response` ON `forms_review_rounds` (`response_id`,`opened_at`);
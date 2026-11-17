CREATE TABLE `forms_drafts` (
	`form_id` text PRIMARY KEY NOT NULL,
	`definition` text NOT NULL,
	`format` integer NOT NULL,
	`edit_revision` integer DEFAULT 0 NOT NULL,
	`edited_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_forms_drafts_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`)
);
--> statement-breakpoint
CREATE TABLE `forms_fields` (
	`form_id` text NOT NULL,
	`question_id` text NOT NULL,
	`key` text NOT NULL,
	`type` text NOT NULL,
	`data_class` text NOT NULL,
	`label` text NOT NULL,
	`first_version` integer NOT NULL,
	`retired_in_version` integer,
	CONSTRAINT `forms_fields_pk` PRIMARY KEY(`form_id`, `question_id`),
	CONSTRAINT `fk_forms_fields_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`),
	CONSTRAINT "forms_fields_class" CHECK("data_class" IN ('public', 'internal', 'personal', 'free-text', 'special'))
);
--> statement-breakpoint
CREATE TABLE `forms_forms` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`mode` text DEFAULT 'submission' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`live_version_id` text,
	`anonymous` integer DEFAULT false NOT NULL,
	`retention_days` integer,
	`retention_declined_days` integer,
	`template_key` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`archived_at` integer,
	CONSTRAINT `fk_forms_forms_live_version_id_forms_versions_id_fk` FOREIGN KEY (`live_version_id`) REFERENCES `forms_versions`(`id`),
	CONSTRAINT "forms_forms_mode" CHECK("mode" IN ('submission', 'record')),
	CONSTRAINT "forms_forms_status" CHECK("status" IN ('draft', 'live', 'paused', 'closed', 'archived'))
);
--> statement-breakpoint
CREATE TABLE `forms_versions` (
	`id` text PRIMARY KEY,
	`form_id` text NOT NULL,
	`number` integer NOT NULL,
	`definition` text NOT NULL,
	`definition_hash` text NOT NULL,
	`format` integer NOT NULL,
	`change_summary` text NOT NULL,
	`published_by` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_forms_versions_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forms_fields_key` ON `forms_fields` (`form_id`,`key`);--> statement-breakpoint
CREATE INDEX `forms_fields_form` ON `forms_fields` (`form_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_forms_slug` ON `forms_forms` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `forms_versions_number` ON `forms_versions` (`form_id`,`number`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `forms_versions_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `forms_versions_append_only_delete` BEFORE DELETE ON `forms_versions` BEGIN SELECT RAISE(ABORT, 'append-only: forms_versions'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `forms_versions_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `forms_versions_append_only_update` BEFORE UPDATE ON `forms_versions` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`form_id` IS OLD.`form_id` AND NEW.`number` IS OLD.`number` AND NEW.`definition` IS OLD.`definition` AND NEW.`definition_hash` IS OLD.`definition_hash` AND NEW.`format` IS OLD.`format` AND NEW.`change_summary` IS OLD.`change_summary` AND NEW.`published_by` IS OLD.`published_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: forms_versions'); END;

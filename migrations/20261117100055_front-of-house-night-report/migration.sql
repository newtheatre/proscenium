CREATE TABLE `front_of_house_night_report_notes` (
	`id` text PRIMARY KEY,
	`report_id` text NOT NULL,
	`kind` text NOT NULL,
	`topic` text NOT NULL,
	`body` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_night_report_notes_report_id_front_of_house_night_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `front_of_house_night_reports`(`id`),
	CONSTRAINT "front_of_house_night_report_notes_kind" CHECK("kind" IN ('note', 'addendum')),
	CONSTRAINT "front_of_house_night_report_notes_topic" CHECK("topic" IN ('audience', 'building', 'show', 'staffing', 'other')),
	CONSTRAINT "front_of_house_night_report_notes_body" CHECK(length("body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_night_reports` (
	`id` text PRIMARY KEY,
	`performance_id` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`snapshot` text,
	`snapshot_version` integer DEFAULT 1 NOT NULL,
	`signed_off_by` text,
	`signed_off_at` integer,
	`distributed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "front_of_house_night_reports_state" CHECK("state" IN ('draft', 'signed_off')),
	CONSTRAINT "front_of_house_night_reports_signed" CHECK("state" = 'draft' OR ("snapshot" IS NOT NULL AND "signed_off_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `front_of_house_night_report_notes_report` ON `front_of_house_night_report_notes` (`report_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_night_reports_performance` ON `front_of_house_night_reports` (`performance_id`);--> statement-breakpoint
CREATE INDEX `front_of_house_night_reports_state` ON `front_of_house_night_reports` (`state`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `front_of_house_night_report_notes_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `front_of_house_night_report_notes_append_only_delete` BEFORE DELETE ON `front_of_house_night_report_notes` BEGIN SELECT RAISE(ABORT, 'append-only: front_of_house_night_report_notes'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `front_of_house_night_report_notes_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `front_of_house_night_report_notes_append_only_update` BEFORE UPDATE ON `front_of_house_night_report_notes` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`report_id` IS OLD.`report_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`topic` IS OLD.`topic` AND NEW.`body` IS OLD.`body` AND NEW.`author_id` IS OLD.`author_id` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: front_of_house_night_report_notes'); END;
--> statement-breakpoint
-- Written by hand: a signed-off night report cannot change, except to record when it was sent
-- (Front of house specification, part 2). A correction is an addendum in the notes.
CREATE TRIGGER `front_of_house_night_reports_signed_update` BEFORE UPDATE ON `front_of_house_night_reports` WHEN OLD.`state` = 'signed_off' AND NOT (NEW.`id` IS OLD.`id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`state` IS OLD.`state` AND NEW.`snapshot` IS OLD.`snapshot` AND NEW.`snapshot_version` IS OLD.`snapshot_version` AND NEW.`signed_off_by` IS OLD.`signed_off_by` AND NEW.`signed_off_at` IS OLD.`signed_off_at` AND NEW.`created_at` IS OLD.`created_at` AND NEW.`updated_at` IS OLD.`updated_at`) BEGIN SELECT RAISE(ABORT, 'front-of-house: a signed-off night report cannot change'); END;
--> statement-breakpoint
CREATE TRIGGER `front_of_house_night_reports_signed_delete` BEFORE DELETE ON `front_of_house_night_reports` WHEN OLD.`state` = 'signed_off' BEGIN SELECT RAISE(ABORT, 'front-of-house: a signed-off night report cannot change'); END;

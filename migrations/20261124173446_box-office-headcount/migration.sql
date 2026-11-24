CREATE TABLE `box_office_headcount_taps` (
	`id` text PRIMARY KEY,
	`performance_id` text NOT NULL,
	`kind` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`reverses_id` text,
	`reason_term_id` text,
	`tapped_by` text NOT NULL,
	`device_label` text,
	`tapped_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`offline` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_box_office_headcount_taps_reverses_id_box_office_headcount_taps_id_fk` FOREIGN KEY (`reverses_id`) REFERENCES `box_office_headcount_taps`(`id`),
	CONSTRAINT `fk_box_office_headcount_taps_reason_term_id_core_terms_id_fk` FOREIGN KEY (`reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "box_office_headcount_taps_kind" CHECK("kind" IN ('in', 'out', 'undo')),
	CONSTRAINT "box_office_headcount_taps_quantity" CHECK("quantity" BETWEEN 1 AND 50),
	CONSTRAINT "box_office_headcount_taps_reverses" CHECK(("kind" = 'undo') = ("reverses_id" IS NOT NULL)),
	CONSTRAINT "box_office_headcount_taps_device" CHECK("device_label" IS NULL OR length("device_label") <= 40)
);
--> statement-breakpoint
CREATE INDEX `box_office_headcount_taps_performance` ON `box_office_headcount_taps` (`performance_id`,`tapped_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_headcount_taps_reverses` ON `box_office_headcount_taps` (`reverses_id`) WHERE reverses_id IS NOT NULL;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_headcount_taps_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `box_office_headcount_taps_append_only_delete` BEFORE DELETE ON `box_office_headcount_taps` BEGIN SELECT RAISE(ABORT, 'append-only: box_office_headcount_taps'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_headcount_taps_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `box_office_headcount_taps_append_only_update` BEFORE UPDATE ON `box_office_headcount_taps` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`quantity` IS OLD.`quantity` AND NEW.`reverses_id` IS OLD.`reverses_id` AND NEW.`reason_term_id` IS OLD.`reason_term_id` AND NEW.`tapped_by` IS OLD.`tapped_by` AND NEW.`device_label` IS OLD.`device_label` AND NEW.`tapped_at` IS OLD.`tapped_at` AND NEW.`received_at` IS OLD.`received_at` AND NEW.`offline` IS OLD.`offline`) BEGIN SELECT RAISE(ABORT, 'append-only: box_office_headcount_taps'); END;

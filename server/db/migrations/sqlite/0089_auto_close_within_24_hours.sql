-- Hand-authored rebuild (E-125, docs/decisions/0063-hand-authored-table-rebuilds.md). Only
-- `night_reports` rebuilds in place: `night_report_addenda` and `night_report_deliveries` both
-- carry a live restrict FK onto it (deliveries also onto addenda), and a table with a restrict
-- FK still live blocks the table it points at from being dropped even once the referencing
-- table has itself been freshly rebuilt (proved against a real three-table fixture, not
-- reasoned about). Both are held, dropped, and recreated after `night_reports` exists in its
-- new shape, each with its own triggers re-created by hand, since neither goes through the
-- `__new_` rename that would otherwise let `check:migrations` verify that for them.
CREATE TABLE `__hold_night_report_deliveries` AS SELECT * FROM `night_report_deliveries`;
--> statement-breakpoint
DROP TABLE `night_report_deliveries`;
--> statement-breakpoint
CREATE TABLE `__hold_night_report_addenda` AS SELECT * FROM `night_report_addenda`;
--> statement-breakpoint
DROP TABLE `night_report_addenda`;
--> statement-breakpoint
CREATE TABLE `__new_night_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`night` text NOT NULL,
	`closing_note` text NOT NULL,
	`report` text NOT NULL,
	`signed_by` text,
	`signed_via` text NOT NULL,
	`signed_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`signed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "night_reports_signed_via_values" CHECK("__new_night_reports"."signed_via" IN ('SHIFT', 'OFFICER', 'SYSTEM')),
	CONSTRAINT "night_reports_system_has_no_signatory" CHECK(
    ("__new_night_reports"."signed_via" = 'SYSTEM' AND "__new_night_reports"."signed_by" IS NULL) OR ("__new_night_reports"."signed_via" != 'SYSTEM' AND "__new_night_reports"."signed_by" IS NOT NULL)
  )
);
--> statement-breakpoint
INSERT INTO `__new_night_reports` (
	`id`, `performance_id`, `venue_id`, `night`, `closing_note`, `report`, `signed_by`, `signed_via`, `signed_at`
)
SELECT
	`id`, `performance_id`, `venue_id`, `night`, `closing_note`, `report`, `signed_by`, `signed_via`, `signed_at`
FROM `night_reports`;
--> statement-breakpoint
DROP TABLE `night_reports`;
--> statement-breakpoint
ALTER TABLE `__new_night_reports` RENAME TO `night_reports`;
--> statement-breakpoint
CREATE UNIQUE INDEX `night_reports_performance` ON `night_reports` (`performance_id`);
--> statement-breakpoint
CREATE INDEX `night_reports_venue_night` ON `night_reports` (`venue_id`,`night`);
--> statement-breakpoint
-- Append-only is trigger-enforced, not a convention (decision 0010). A correction is an addendum
-- naming what it corrects, never an edit to the report itself (E-124 criterion 5).
CREATE TRIGGER night_reports_no_update
BEFORE UPDATE ON night_reports
BEGIN
  SELECT RAISE(ABORT, 'night_reports is append-only: add an addendum instead');
END;
--> statement-breakpoint
CREATE TRIGGER night_reports_no_delete
BEFORE DELETE ON night_reports
BEGIN
  SELECT RAISE(ABORT, 'night_reports is append-only: add an addendum instead');
END;
--> statement-breakpoint
CREATE TABLE `night_report_addenda` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`note` text NOT NULL,
	`added_by` text NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `night_reports`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `night_report_addenda` (`id`, `report_id`, `note`, `added_by`, `added_at`)
SELECT `id`, `report_id`, `note`, `added_by`, `added_at` FROM `__hold_night_report_addenda`;
--> statement-breakpoint
DROP TABLE `__hold_night_report_addenda`;
--> statement-breakpoint
CREATE INDEX `night_report_addenda_report` ON `night_report_addenda` (`report_id`);
--> statement-breakpoint
CREATE TRIGGER night_report_addenda_no_update
BEFORE UPDATE ON night_report_addenda
BEGIN
  SELECT RAISE(ABORT, 'night_report_addenda is append-only: add a further addendum instead');
END;
--> statement-breakpoint
CREATE TRIGGER night_report_addenda_no_delete
BEFORE DELETE ON night_report_addenda
BEGIN
  SELECT RAISE(ABORT, 'night_report_addenda is append-only: add a further addendum instead');
END;
--> statement-breakpoint
CREATE TABLE `night_report_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`addendum_id` text,
	`recipient` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`sent_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `night_reports`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`addendum_id`) REFERENCES `night_report_addenda`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "night_report_deliveries_status_values" CHECK("night_report_deliveries"."status" IN ('SENT', 'FAILED'))
);
--> statement-breakpoint
INSERT INTO `night_report_deliveries` (`id`, `report_id`, `addendum_id`, `recipient`, `status`, `error`, `sent_at`, `created_at`)
SELECT `id`, `report_id`, `addendum_id`, `recipient`, `status`, `error`, `sent_at`, `created_at` FROM `__hold_night_report_deliveries`;
--> statement-breakpoint
DROP TABLE `__hold_night_report_deliveries`;
--> statement-breakpoint
CREATE INDEX `night_report_deliveries_report` ON `night_report_deliveries` (`report_id`);
--> statement-breakpoint
CREATE INDEX `night_report_deliveries_status` ON `night_report_deliveries` (`status`);
--> statement-breakpoint
CREATE TRIGGER night_report_deliveries_no_update
BEFORE UPDATE ON night_report_deliveries
BEGIN
  SELECT RAISE(ABORT, 'night_report_deliveries is append-only: add a new attempt row instead');
END;
--> statement-breakpoint
CREATE TRIGGER night_report_deliveries_no_delete
BEFORE DELETE ON night_report_deliveries
BEGIN
  SELECT RAISE(ABORT, 'night_report_deliveries is append-only: add a new attempt row instead');
END;

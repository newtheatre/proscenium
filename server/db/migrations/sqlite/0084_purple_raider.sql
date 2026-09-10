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
CREATE INDEX `night_report_addenda_report` ON `night_report_addenda` (`report_id`);--> statement-breakpoint
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
CREATE INDEX `night_report_deliveries_report` ON `night_report_deliveries` (`report_id`);--> statement-breakpoint
CREATE INDEX `night_report_deliveries_status` ON `night_report_deliveries` (`status`);--> statement-breakpoint
CREATE TABLE `night_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`night` text NOT NULL,
	`closing_note` text NOT NULL,
	`report` text NOT NULL,
	`signed_by` text NOT NULL,
	`signed_via` text NOT NULL,
	`signed_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`signed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "night_reports_signed_via_values" CHECK("night_reports"."signed_via" IN ('SHIFT', 'OFFICER'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `night_reports_performance` ON `night_reports` (`performance_id`);--> statement-breakpoint
CREATE INDEX `night_reports_venue_night` ON `night_reports` (`venue_id`,`night`);--> statement-breakpoint
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
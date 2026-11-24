CREATE TABLE `invoicing_reminders` (
	`id` text PRIMARY KEY,
	`invoice_id` text NOT NULL,
	`step` text NOT NULL,
	`notification_id` text NOT NULL,
	`sent_by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_invoicing_reminders_invoice_id_invoicing_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoicing_invoices`(`id`),
	CONSTRAINT "invoicing_reminders_steps" CHECK("step" IN ('sent', 'before-due', 'overdue-1', 'overdue-2', 'manual'))
);
--> statement-breakpoint
CREATE INDEX `invoicing_reminders_invoice` ON `invoicing_reminders` (`invoice_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoicing_reminders_step` ON `invoicing_reminders` (`invoice_id`,`step`) WHERE step IN ('sent', 'before-due', 'overdue-1', 'overdue-2');
--> statement-breakpoint
DROP TRIGGER IF EXISTS `invoicing_reminders_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `invoicing_reminders_append_only_delete` BEFORE DELETE ON `invoicing_reminders` BEGIN SELECT RAISE(ABORT, 'append-only: invoicing_reminders'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `invoicing_reminders_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `invoicing_reminders_append_only_update` BEFORE UPDATE ON `invoicing_reminders` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`invoice_id` IS OLD.`invoice_id` AND NEW.`step` IS OLD.`step` AND NEW.`notification_id` IS OLD.`notification_id` AND NEW.`sent_by` IS OLD.`sent_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: invoicing_reminders'); END;

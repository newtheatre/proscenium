ALTER TABLE `invoicing_allocations` ADD `reason_term` text REFERENCES core_terms(id);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `invoicing_allocations_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `invoicing_allocations_append_only_delete` BEFORE DELETE ON `invoicing_allocations` BEGIN SELECT RAISE(ABORT, 'append-only: invoicing_allocations'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `invoicing_allocations_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `invoicing_allocations_append_only_update` BEFORE UPDATE ON `invoicing_allocations` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`invoice_id` IS OLD.`invoice_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`reverses_id` IS OLD.`reverses_id` AND NEW.`intent_id` IS OLD.`intent_id` AND NEW.`disbursement_id` IS OLD.`disbursement_id` AND NEW.`credit_note_id` IS OLD.`credit_note_id` AND NEW.`posting_id` IS OLD.`posting_id` AND NEW.`reason_term` IS OLD.`reason_term` AND NEW.`on_date` IS OLD.`on_date` AND NEW.`by` IS OLD.`by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: invoicing_allocations'); END;

-- A refund the system asked for may be withdrawn when the payment is kept, and its amount stops counting as refunded.
DROP TRIGGER IF EXISTS `payments_refunds_fixed`;--> statement-breakpoint
CREATE TRIGGER `payments_refunds_fixed` BEFORE UPDATE ON `payments_refunds` WHEN NEW.`attempt_id` <> OLD.`attempt_id` OR NEW.`part_id` <> OLD.`part_id` OR NEW.`amount_minor` <> OLD.`amount_minor` OR NEW.`self_approve_limit_minor` <> OLD.`self_approve_limit_minor` OR NEW.`requested_by` IS NOT OLD.`requested_by` OR (NEW.`state` <> OLD.`state` AND NOT ((OLD.`state` = 'requested' AND NEW.`state` IN ('approved', 'declined')) OR (OLD.`state` = 'approved' AND NEW.`state` IN ('sent', 'succeeded', 'failed')) OR (OLD.`state` = 'sent' AND NEW.`state` IN ('succeeded', 'failed')) OR (OLD.`state` = 'approved' AND NEW.`state` = 'declined' AND NEW.`requested_by` IS NULL))) BEGIN SELECT RAISE(ABORT, 'payments: a refund keeps its amount and moves only forward'); END;--> statement-breakpoint
CREATE TRIGGER `payments_refunds_count_withdrawn` AFTER UPDATE OF `state` ON `payments_refunds` WHEN OLD.`state` = 'approved' AND NEW.`state` = 'declined' BEGIN UPDATE `payments_intent_parts` SET `refunded_minor` = `refunded_minor` - NEW.`amount_minor` WHERE `id` = NEW.`part_id`; UPDATE `payments_attempts` SET `refunded_minor` = `refunded_minor` - NEW.`amount_minor` WHERE `id` = NEW.`attempt_id`; END;--> statement-breakpoint
-- A site made before payments could be kept gains the reason a withdrawn refund carries.
INSERT OR IGNORE INTO `core_terms` (`id`, `vocabulary_key`, `slug`, `label`, `sort`, `seeded`, `created_at`)
SELECT 'trm_23oc3rflnr2czlgazdeo2ogzca', `key`, 'payment-kept', 'Payment kept: they had what they paid for',
	coalesce((SELECT max(`sort`) FROM `core_terms` WHERE `vocabulary_key` = 'payments.refund-decline-reason'), -1) + 1,
	1, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM `core_vocabularies` WHERE `key` = 'payments.refund-decline-reason'
	AND NOT EXISTS (SELECT 1 FROM `core_terms` WHERE `vocabulary_key` = 'payments.refund-decline-reason' AND `slug` = 'payment-kept');

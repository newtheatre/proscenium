-- Written by hand: a paid till sale's receipt addresses stay until each receipt is sent, by the job
-- the settling unit queues; an unpaid one's still go when the sale ends.
DROP TRIGGER `payments_intents_clear_receipts`;--> statement-breakpoint
CREATE TRIGGER `payments_intents_clear_receipts` AFTER UPDATE OF `state` ON `payments_intents` WHEN OLD.`state` = 'open' AND NEW.`state` NOT IN ('open', 'succeeded') BEGIN UPDATE `payments_till_splits` SET `receipt_to` = NULL WHERE `intent_id` = NEW.`id`; END;

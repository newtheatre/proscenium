CREATE TABLE `payments_till_splits` (
	`id` text PRIMARY KEY,
	`intent_id` text NOT NULL,
	`position` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`items` text NOT NULL,
	`attempt_id` text,
	`receipt_account_id` text,
	`receipt_to` text,
	`receipt_sent_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_payments_till_splits_intent_id_payments_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `payments_intents`(`id`),
	CONSTRAINT `fk_payments_till_splits_attempt_id_payments_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `payments_attempts`(`id`),
	CONSTRAINT "payments_till_splits_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "payments_till_splits_position" CHECK("position" >= 0),
	CONSTRAINT "payments_till_splits_one_receipt" CHECK("receipt_account_id" IS NULL OR "receipt_to" IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_till_splits_position` ON `payments_till_splits` (`intent_id`,`position`);--> statement-breakpoint
CREATE INDEX `payments_till_splits_attempt` ON `payments_till_splits` (`attempt_id`) WHERE attempt_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_till_splits_account` ON `payments_till_splits` (`receipt_account_id`) WHERE receipt_account_id IS NOT NULL;--> statement-breakpoint
-- Written by hand: a till sale's receipt addresses go once the sale has ended, whatever way it ended.
CREATE TRIGGER `payments_intents_clear_receipts` AFTER UPDATE OF `state` ON `payments_intents` WHEN OLD.`state` = 'open' AND NEW.`state` <> 'open' BEGIN UPDATE `payments_till_splits` SET `receipt_to` = NULL WHERE `intent_id` = NEW.`id`; END;

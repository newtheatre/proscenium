CREATE TABLE `payments_attempt_events` (
	`id` text PRIMARY KEY,
	`attempt_id` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`webhook_event_id` text,
	`by` text,
	`at` integer NOT NULL,
	CONSTRAINT `fk_payments_attempt_events_attempt_id_payments_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `payments_attempts`(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments_attempts` (
	`id` text PRIMARY KEY,
	`intent_id` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`method` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`state` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`provider_ref` text,
	`reader_id` text,
	`fee_minor` integer,
	`refunded_minor` integer DEFAULT 0 NOT NULL,
	`tendered_minor` integer,
	`answered_by` text,
	`failure_code` text,
	`started_at` integer NOT NULL,
	`answered_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_payments_attempts_intent_id_payments_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `payments_intents`(`id`),
	CONSTRAINT `fk_payments_attempts_provider_account_id_payments_provider_accounts_id_fk` FOREIGN KEY (`provider_account_id`) REFERENCES `payments_provider_accounts`(`id`),
	CONSTRAINT `fk_payments_attempts_reader_id_payments_readers_id_fk` FOREIGN KEY (`reader_id`) REFERENCES `payments_readers`(`id`),
	CONSTRAINT "payments_attempts_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "payments_attempts_refunded" CHECK("refunded_minor" >= 0 AND "refunded_minor" <= "amount_minor"),
	CONSTRAINT "payments_attempts_method" CHECK("method" IN ('card_online', 'card_reader', 'card_attested', 'cash', 'other_attested')),
	CONSTRAINT "payments_attempts_state" CHECK("state" IN ('started', 'pending', 'succeeded', 'failed', 'cancelled', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE `payments_intent_parts` (
	`id` text PRIMARY KEY,
	`intent_id` text NOT NULL,
	`owner_module` text NOT NULL,
	`owner_record` text NOT NULL,
	`open` integer,
	`amount_minor` integer NOT NULL,
	`refunded_minor` integer DEFAULT 0 NOT NULL,
	`settled_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_payments_intent_parts_intent_id_payments_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `payments_intents`(`id`),
	CONSTRAINT "payments_intent_parts_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "payments_intent_parts_refunded" CHECK("refunded_minor" >= 0 AND "refunded_minor" <= "amount_minor"),
	CONSTRAINT "payments_intent_parts_open" CHECK("open" IS NULL OR "open" = 1)
);
--> statement-breakpoint
CREATE TABLE `payments_intents` (
	`id` text PRIMARY KEY,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`channel` text NOT NULL,
	`state` text NOT NULL,
	`expires_at` integer NOT NULL,
	`session_id` text,
	`settled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_payments_intents_session_id_payments_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `payments_sessions`(`id`),
	CONSTRAINT "payments_intents_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "payments_intents_channel" CHECK("channel" IN ('online', 'desk')),
	CONSTRAINT "payments_intents_state" CHECK("state" IN ('open', 'succeeded', 'cancelled', 'expired', 'unfulfilled'))
);
--> statement-breakpoint
CREATE TABLE `payments_provider_accounts` (
	`id` text PRIMARY KEY,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`channels` text NOT NULL,
	`mode` text NOT NULL,
	`external_ref` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "payments_provider_accounts_mode" CHECK("mode" IN ('live', 'test'))
);
--> statement-breakpoint
CREATE TABLE `payments_readers` (
	`id` text PRIMARY KEY,
	`provider_account_id` text NOT NULL,
	`label` text NOT NULL,
	`external_ref` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_payments_readers_provider_account_id_payments_provider_accounts_id_fk` FOREIGN KEY (`provider_account_id`) REFERENCES `payments_provider_accounts`(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments_refunds` (
	`id` text PRIMARY KEY,
	`attempt_id` text NOT NULL,
	`part_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`state` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`provider_ref` text,
	`requested_by` text,
	`self_approve_limit_minor` integer NOT NULL,
	`approved_by` text,
	`decline_reason_term_id` text,
	`fee_returned_minor` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_payments_refunds_attempt_id_payments_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `payments_attempts`(`id`),
	CONSTRAINT `fk_payments_refunds_part_id_payments_intent_parts_id_fk` FOREIGN KEY (`part_id`) REFERENCES `payments_intent_parts`(`id`),
	CONSTRAINT `fk_payments_refunds_decline_reason_term_id_core_terms_id_fk` FOREIGN KEY (`decline_reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "payments_refunds_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "payments_refunds_state" CHECK("state" IN ('requested', 'approved', 'sent', 'succeeded', 'failed', 'declined')),
	CONSTRAINT "payments_refunds_two_people" CHECK("approved_by" IS NULL OR "requested_by" IS NULL OR "approved_by" <> "requested_by" OR "amount_minor" <= "self_approve_limit_minor"),
	CONSTRAINT "payments_refunds_declined_reason" CHECK("state" <> 'declined' OR "decline_reason_term_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `payments_sessions` (
	`id` text PRIMARY KEY,
	`point_label` text NOT NULL,
	`opened_by` text NOT NULL,
	`closed_by` text,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`state` text NOT NULL,
	`float_minor` integer NOT NULL,
	`expected_cash_minor` integer,
	`counted_cash_minor` integer,
	`variance_note` text,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "payments_sessions_state" CHECK("state" IN ('open', 'counting', 'closed')),
	CONSTRAINT "payments_sessions_float" CHECK("float_minor" >= 0),
	CONSTRAINT "payments_sessions_note" CHECK("variance_note" IS NULL OR length("variance_note") <= 200)
);
--> statement-breakpoint
CREATE TABLE `payments_webhook_events` (
	`id` text PRIMARY KEY,
	`provider_account_id` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`type` text NOT NULL,
	`signature_ok` integer NOT NULL,
	`attempt_id` text,
	`received_at` integer NOT NULL,
	`handled_at` integer,
	CONSTRAINT `fk_payments_webhook_events_provider_account_id_payments_provider_accounts_id_fk` FOREIGN KEY (`provider_account_id`) REFERENCES `payments_provider_accounts`(`id`),
	CONSTRAINT `fk_payments_webhook_events_attempt_id_payments_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `payments_attempts`(`id`)
);
--> statement-breakpoint
CREATE INDEX `payments_attempt_events_attempt` ON `payments_attempt_events` (`attempt_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_attempts_idempotency_key` ON `payments_attempts` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_attempts_provider_ref` ON `payments_attempts` (`provider_account_id`,`provider_ref`) WHERE provider_ref IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_attempts_reader_busy` ON `payments_attempts` (`reader_id`) WHERE reader_id IS NOT NULL AND state IN ('started', 'pending');--> statement-breakpoint
CREATE INDEX `payments_attempts_intent` ON `payments_attempts` (`intent_id`);--> statement-breakpoint
CREATE INDEX `payments_attempts_waiting` ON `payments_attempts` (`state`) WHERE state IN ('pending', 'unknown');--> statement-breakpoint
CREATE UNIQUE INDEX `payments_intent_parts_owner` ON `payments_intent_parts` (`intent_id`,`owner_module`,`owner_record`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_intent_parts_one_open` ON `payments_intent_parts` (`owner_module`,`owner_record`) WHERE open = 1;--> statement-breakpoint
CREATE INDEX `payments_intents_open` ON `payments_intents` (`state`,`expires_at`);--> statement-breakpoint
CREATE INDEX `payments_intents_session` ON `payments_intents` (`session_id`) WHERE session_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_refunds_idempotency_key` ON `payments_refunds` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `payments_refunds_part` ON `payments_refunds` (`part_id`);--> statement-breakpoint
CREATE INDEX `payments_refunds_waiting` ON `payments_refunds` (`state`) WHERE state IN ('requested', 'approved', 'sent', 'failed');--> statement-breakpoint
CREATE UNIQUE INDEX `payments_sessions_one_open` ON `payments_sessions` (`opened_by`) WHERE state <> 'closed';--> statement-breakpoint
CREATE UNIQUE INDEX `payments_webhook_events_event` ON `payments_webhook_events` (`provider_account_id`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `payments_webhook_events_received` ON `payments_webhook_events` (`received_at`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `payments_attempt_events_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `payments_attempt_events_append_only_delete` BEFORE DELETE ON `payments_attempt_events` BEGIN SELECT RAISE(ABORT, 'append-only: payments_attempt_events'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `payments_attempt_events_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `payments_attempt_events_append_only_update` BEFORE UPDATE ON `payments_attempt_events` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`attempt_id` IS OLD.`attempt_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`source` IS OLD.`source` AND NEW.`webhook_event_id` IS OLD.`webhook_event_id` AND NEW.`by` IS OLD.`by` AND NEW.`at` IS OLD.`at`) BEGIN SELECT RAISE(ABORT, 'append-only: payments_attempt_events'); END;
--> statement-breakpoint
-- Written by hand: Payments' own rules (Box office specification, part 3). An intent's amount never
-- changes, it leaves open once, and leaving open frees its records for another intent.
CREATE TRIGGER `payments_intents_fixed` BEFORE UPDATE ON `payments_intents` WHEN NEW.`amount_minor` <> OLD.`amount_minor` OR NEW.`currency` <> OLD.`currency` OR NEW.`channel` <> OLD.`channel` OR (NEW.`state` <> OLD.`state` AND NOT (OLD.`state` = 'open' AND NEW.`state` IN ('succeeded', 'cancelled', 'expired', 'unfulfilled'))) BEGIN SELECT RAISE(ABORT, 'payments: an intent keeps its amount and leaves open once'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_intents_close_parts` AFTER UPDATE OF `state` ON `payments_intents` WHEN OLD.`state` = 'open' AND NEW.`state` <> 'open' BEGIN UPDATE `payments_intent_parts` SET `open` = NULL WHERE `intent_id` = NEW.`id`; END;
--> statement-breakpoint
CREATE TRIGGER `payments_intents_no_delete` BEFORE DELETE ON `payments_intents` BEGIN SELECT RAISE(ABORT, 'payments: an intent is never deleted'); END;
--> statement-breakpoint
-- A part joins an open intent only, open, unsettled and unrefunded, and never takes the parts past
-- the intent's amount. After that only its open flag (to nothing), settled time and refunded
-- amount change.
CREATE TRIGGER `payments_intent_parts_insert` BEFORE INSERT ON `payments_intent_parts` WHEN coalesce((SELECT `state` FROM `payments_intents` WHERE `id` = NEW.`intent_id`), '') <> 'open' OR NEW.`open` IS NOT 1 OR NEW.`refunded_minor` <> 0 OR NEW.`settled_at` IS NOT NULL OR (SELECT coalesce(sum(`amount_minor`), 0) FROM `payments_intent_parts` WHERE `intent_id` = NEW.`intent_id`) + NEW.`amount_minor` > (SELECT `amount_minor` FROM `payments_intents` WHERE `id` = NEW.`intent_id`) BEGIN SELECT RAISE(ABORT, 'payments: a part joins an open intent and keeps the parts within its amount'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_intent_parts_fixed` BEFORE UPDATE ON `payments_intent_parts` WHEN NEW.`intent_id` <> OLD.`intent_id` OR NEW.`owner_module` <> OLD.`owner_module` OR NEW.`owner_record` <> OLD.`owner_record` OR NEW.`amount_minor` <> OLD.`amount_minor` OR (NEW.`open` IS NOT OLD.`open` AND NEW.`open` IS NOT NULL) OR (OLD.`settled_at` IS NOT NULL AND NEW.`settled_at` IS NOT OLD.`settled_at`) BEGIN SELECT RAISE(ABORT, 'payments: a part keeps its owner and amount'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_intent_parts_no_delete` BEFORE DELETE ON `payments_intent_parts` BEGIN SELECT RAISE(ABORT, 'payments: a part is never deleted'); END;
--> statement-breakpoint
-- An attempt starts on an open intent and moves only forward. Succeeded attempts never add up to
-- more than the intent.
CREATE TRIGGER `payments_attempts_insert` BEFORE INSERT ON `payments_attempts` WHEN NEW.`state` <> 'started' OR NEW.`refunded_minor` <> 0 OR coalesce((SELECT `state` FROM `payments_intents` WHERE `id` = NEW.`intent_id`), '') <> 'open' BEGIN SELECT RAISE(ABORT, 'payments: an attempt starts, on an open intent'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_attempts_fixed` BEFORE UPDATE ON `payments_attempts` WHEN NEW.`intent_id` <> OLD.`intent_id` OR NEW.`provider_account_id` <> OLD.`provider_account_id` OR NEW.`method` <> OLD.`method` OR NEW.`amount_minor` <> OLD.`amount_minor` OR NEW.`idempotency_key` <> OLD.`idempotency_key` OR (NEW.`state` <> OLD.`state` AND NOT ((OLD.`state` = 'started' AND NEW.`state` IN ('pending', 'succeeded', 'failed', 'cancelled')) OR (OLD.`state` = 'pending' AND NEW.`state` IN ('succeeded', 'failed', 'cancelled', 'unknown')) OR (OLD.`state` = 'unknown' AND NEW.`state` IN ('succeeded', 'failed')))) BEGIN SELECT RAISE(ABORT, 'payments: an attempt keeps its amount and moves only forward'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_attempts_within_intent` AFTER UPDATE OF `state` ON `payments_attempts` WHEN NEW.`state` = 'succeeded' AND (SELECT sum(`amount_minor`) FROM `payments_attempts` WHERE `intent_id` = NEW.`intent_id` AND `state` = 'succeeded') > (SELECT `amount_minor` FROM `payments_intents` WHERE `id` = NEW.`intent_id`) BEGIN SELECT RAISE(ABORT, 'payments: more was taken than the intent asks for'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_attempts_no_delete` BEFORE DELETE ON `payments_attempts` BEGIN SELECT RAISE(ABORT, 'payments: an attempt is never deleted'); END;
--> statement-breakpoint
-- A refund is of one part, from a succeeded attempt on that part's intent, and moves only forward.
-- The refunded counters on the part and the attempt add when a refund is approved and subtract only
-- if it fails; their checks refuse a refund of more than was paid.
CREATE TRIGGER `payments_refunds_insert` BEFORE INSERT ON `payments_refunds` WHEN NEW.`state` NOT IN ('requested', 'approved') OR NOT EXISTS (SELECT 1 FROM `payments_attempts` a JOIN `payments_intent_parts` p ON p.`intent_id` = a.`intent_id` WHERE a.`id` = NEW.`attempt_id` AND p.`id` = NEW.`part_id` AND a.`state` = 'succeeded' AND p.`settled_at` IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'payments: a refund is of a settled part, from a succeeded attempt on its intent'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_refunds_fixed` BEFORE UPDATE ON `payments_refunds` WHEN NEW.`attempt_id` <> OLD.`attempt_id` OR NEW.`part_id` <> OLD.`part_id` OR NEW.`amount_minor` <> OLD.`amount_minor` OR NEW.`self_approve_limit_minor` <> OLD.`self_approve_limit_minor` OR NEW.`requested_by` IS NOT OLD.`requested_by` OR (NEW.`state` <> OLD.`state` AND NOT ((OLD.`state` = 'requested' AND NEW.`state` IN ('approved', 'declined')) OR (OLD.`state` = 'approved' AND NEW.`state` IN ('sent', 'succeeded', 'failed')) OR (OLD.`state` = 'sent' AND NEW.`state` IN ('succeeded', 'failed')))) BEGIN SELECT RAISE(ABORT, 'payments: a refund keeps its amount and moves only forward'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_refunds_count_inserted` AFTER INSERT ON `payments_refunds` WHEN NEW.`state` = 'approved' BEGIN UPDATE `payments_intent_parts` SET `refunded_minor` = `refunded_minor` + NEW.`amount_minor` WHERE `id` = NEW.`part_id`; UPDATE `payments_attempts` SET `refunded_minor` = `refunded_minor` + NEW.`amount_minor` WHERE `id` = NEW.`attempt_id`; END;
--> statement-breakpoint
CREATE TRIGGER `payments_refunds_count_approved` AFTER UPDATE OF `state` ON `payments_refunds` WHEN OLD.`state` = 'requested' AND NEW.`state` = 'approved' BEGIN UPDATE `payments_intent_parts` SET `refunded_minor` = `refunded_minor` + NEW.`amount_minor` WHERE `id` = NEW.`part_id`; UPDATE `payments_attempts` SET `refunded_minor` = `refunded_minor` + NEW.`amount_minor` WHERE `id` = NEW.`attempt_id`; END;
--> statement-breakpoint
CREATE TRIGGER `payments_refunds_count_failed` AFTER UPDATE OF `state` ON `payments_refunds` WHEN OLD.`state` IN ('approved', 'sent') AND NEW.`state` = 'failed' BEGIN UPDATE `payments_intent_parts` SET `refunded_minor` = `refunded_minor` - NEW.`amount_minor` WHERE `id` = NEW.`part_id`; UPDATE `payments_attempts` SET `refunded_minor` = `refunded_minor` - NEW.`amount_minor` WHERE `id` = NEW.`attempt_id`; END;
--> statement-breakpoint
CREATE TRIGGER `payments_refunds_no_delete` BEFORE DELETE ON `payments_refunds` BEGIN SELECT RAISE(ABORT, 'payments: a refund is never deleted'); END;

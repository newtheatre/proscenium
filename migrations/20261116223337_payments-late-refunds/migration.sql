-- Written by hand: a payment that succeeds after its intent was cancelled or expired (a seller gave
-- up on the reader and took cash) is held and refunded in full, so a refund may name a part of a
-- cancelled or expired intent as well as of a settled part or an unfulfilled intent.
DROP TRIGGER IF EXISTS `payments_refunds_insert`;
--> statement-breakpoint
CREATE TRIGGER `payments_refunds_insert` BEFORE INSERT ON `payments_refunds` WHEN NEW.`state` NOT IN ('requested', 'approved') OR NOT EXISTS (SELECT 1 FROM `payments_attempts` a JOIN `payments_intent_parts` p ON p.`intent_id` = a.`intent_id` JOIN `payments_intents` i ON i.`id` = a.`intent_id` WHERE a.`id` = NEW.`attempt_id` AND p.`id` = NEW.`part_id` AND a.`state` = 'succeeded' AND (p.`settled_at` IS NOT NULL OR i.`state` IN ('unfulfilled', 'cancelled', 'expired'))) BEGIN SELECT RAISE(ABORT, 'payments: a refund is of a settled part, or of a payment that could not be fulfilled, from a succeeded attempt on its intent'); END;

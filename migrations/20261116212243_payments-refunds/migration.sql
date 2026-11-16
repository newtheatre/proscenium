ALTER TABLE `payments_refunds` ADD `session_id` text REFERENCES payments_sessions(id);--> statement-breakpoint
-- Written by hand: an unfulfilled payment is refunded in full though its parts never settled, so a
-- refund may name a part of a settled part or of an unfulfilled intent.
DROP TRIGGER IF EXISTS `payments_refunds_insert`;
--> statement-breakpoint
CREATE TRIGGER `payments_refunds_insert` BEFORE INSERT ON `payments_refunds` WHEN NEW.`state` NOT IN ('requested', 'approved') OR NOT EXISTS (SELECT 1 FROM `payments_attempts` a JOIN `payments_intent_parts` p ON p.`intent_id` = a.`intent_id` JOIN `payments_intents` i ON i.`id` = a.`intent_id` WHERE a.`id` = NEW.`attempt_id` AND p.`id` = NEW.`part_id` AND a.`state` = 'succeeded' AND (p.`settled_at` IS NOT NULL OR i.`state` = 'unfulfilled')) BEGIN SELECT RAISE(ABORT, 'payments: a refund is of a settled part, or of an unfulfilled payment, from a succeeded attempt on its intent'); END;

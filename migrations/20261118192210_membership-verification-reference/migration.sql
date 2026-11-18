ALTER TABLE `membership_verifications` ADD `reference` text;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `membership_verifications_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `membership_verifications_append_only_delete` BEFORE DELETE ON `membership_verifications` BEGIN SELECT RAISE(ABORT, 'append-only: membership_verifications'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `membership_verifications_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `membership_verifications_append_only_update` BEFORE UPDATE ON `membership_verifications` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`membership_id` IS OLD.`membership_id` AND NEW.`verifier` IS OLD.`verifier` AND NEW.`outcome` IS OLD.`outcome` AND NEW.`reason` IS OLD.`reason` AND NEW.`entry_id` IS OLD.`entry_id` AND (NEW.`reference` IS OLD.`reference` OR NEW.`reference` IS NULL) AND NEW.`decided_by` IS OLD.`decided_by` AND (NEW.`note` IS OLD.`note` OR NEW.`note` IS '[removed]') AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: membership_verifications'); END;

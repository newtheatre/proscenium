ALTER TABLE `payments_sessions` ADD `space_id` text;--> statement-breakpoint
ALTER TABLE `payments_sessions` ADD `closed_how` text;--> statement-breakpoint
DROP INDEX IF EXISTS `payments_sessions_one_open`;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_sessions_one_open` ON `payments_sessions` (`opened_by`) WHERE state = 'open';--> statement-breakpoint
UPDATE `payments_sessions` SET `closed_how` = 'hand' WHERE `state` = 'closed';

ALTER TABLE `core_spaces` ADD `managed` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `core_spaces` ADD `finding_it` text;--> statement-breakpoint
-- R-36: each space takes its venue's answer before the venue's column goes.
UPDATE `core_spaces` SET `managed` = (SELECT `managed` FROM `core_venues` WHERE `core_venues`.`id` = `core_spaces`.`venue_id`);--> statement-breakpoint
ALTER TABLE `core_venues` DROP COLUMN `managed`;
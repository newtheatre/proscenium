ALTER TABLE `box_office_passes` ADD `alias_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_passes_alias` ON `box_office_passes` (`alias_hash`) WHERE alias_hash IS NOT NULL;
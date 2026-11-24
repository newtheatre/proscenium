ALTER TABLE `companies_companies` ADD `name_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `companies_companies_name_key` ON `companies_companies` (`name_key`);
CREATE TABLE `core_policy_versions` (
	`id` text PRIMARY KEY,
	`policy` text NOT NULL,
	`number` integer NOT NULL,
	`hash` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `box_office_orders` ADD `terms_version_id` text REFERENCES core_policy_versions(id);--> statement-breakpoint
CREATE UNIQUE INDEX `core_policy_versions_number` ON `core_policy_versions` (`policy`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_policy_versions_hash` ON `core_policy_versions` (`policy`,`hash`);
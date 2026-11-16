CREATE TABLE `core_emergency_contacts` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`relationship` text,
	`phone` text NOT NULL,
	`updated_at` integer NOT NULL,
	`standing_lost_at` integer,
	CONSTRAINT "core_emergency_contacts_relationship" CHECK("relationship" IS NULL OR length("relationship") BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE INDEX `core_emergency_contacts_account` ON `core_emergency_contacts` (`account_id`);
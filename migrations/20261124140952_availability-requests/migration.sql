ALTER TABLE `availability_requests` ADD `account_refs` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `availability_requests` ADD `reminded_at` integer;
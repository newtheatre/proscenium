ALTER TABLE `users` RENAME COLUMN "full_name" TO "name";--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `is_active`;
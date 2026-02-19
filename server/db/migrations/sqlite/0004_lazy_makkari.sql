DROP INDEX `venue_features_is_active_idx`;--> statement-breakpoint
ALTER TABLE `venue_features` DROP COLUMN `is_active`;--> statement-breakpoint
DROP INDEX `venues_is_active_idx`;--> statement-breakpoint
ALTER TABLE `venues` DROP COLUMN `is_active`;
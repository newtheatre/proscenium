DROP INDEX `fellowships_user_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `fellowships_one_standing` ON `fellowships` (`user_id`) WHERE revoked_at IS NULL;
DROP TABLE `email_verifications`;--> statement-breakpoint
DROP TABLE `password_resets`;--> statement-breakpoint
DROP TABLE `user_roles`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `password`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `email_verified`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `last_login`;--> statement-breakpoint
-- Mirror emails are lowercase (canonical store convention). Safe only after
-- scripts/migrate proscenium-fixes.sql folded the case-duplicate rows.
UPDATE `users` SET `email` = lower(`email`);

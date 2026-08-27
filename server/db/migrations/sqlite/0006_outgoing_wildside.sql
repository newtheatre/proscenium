CREATE INDEX `users_disabled` ON `users` (`disabled`);--> statement-breakpoint
CREATE INDEX `users_verified` ON `users` (`verified`);--> statement-breakpoint
CREATE INDEX `users_anonymised_at` ON `users` (`anonymised_at`);--> statement-breakpoint
CREATE INDEX `users_last_login_at` ON `users` (`last_login_at`);--> statement-breakpoint
CREATE INDEX `users_name` ON `users` (`name`);
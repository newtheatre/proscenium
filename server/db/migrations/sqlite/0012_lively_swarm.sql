ALTER TABLE `users` ADD `password_set_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `password_last_used_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `google_linked_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `google_last_used_at` integer;
CREATE TABLE `room_feed_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_fetched_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_feed_tokens_user_id_unique` ON `room_feed_tokens` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `room_feed_tokens_token_hash_unique` ON `room_feed_tokens` (`token_hash`);
CREATE TABLE `period_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`from_day` text NOT NULL,
	`to_day` text NOT NULL,
	`label` text,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "period_locks_action" CHECK("period_locks"."action" IN ('CLOSED', 'REOPENED')),
	CONSTRAINT "period_locks_range_order" CHECK("period_locks"."to_day" >= "period_locks"."from_day")
);
--> statement-breakpoint
CREATE INDEX `period_locks_range` ON `period_locks` (`from_day`,`to_day`,`created_at`);--> statement-breakpoint
CREATE TABLE `periods` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`from_day` text NOT NULL,
	`to_day` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "periods_range_order" CHECK("periods"."to_day" >= "periods"."from_day")
);
--> statement-breakpoint
CREATE INDEX `periods_range` ON `periods` (`from_day`,`to_day`);
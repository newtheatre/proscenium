CREATE TABLE `module_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`module_id` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`reason` text,
	`decided_by` text,
	`decided_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "module_requests_status" CHECK("module_requests"."status" IN ('OPEN', 'SCHEDULED', 'DECLINED', 'WITHDRAWN'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `module_requests_open` ON `module_requests` (`user_id`,`module_id`) WHERE status = 'OPEN';--> statement-breakpoint
CREATE INDEX `module_requests_module_status` ON `module_requests` (`module_id`,`status`);--> statement-breakpoint
CREATE INDEX `module_requests_user` ON `module_requests` (`user_id`);
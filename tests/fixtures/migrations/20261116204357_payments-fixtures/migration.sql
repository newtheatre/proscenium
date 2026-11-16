CREATE TABLE `snacks_sales` (
	`id` text PRIMARY KEY,
	`amount_minor` integer NOT NULL,
	`state` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tickets_orders` (
	`id` text PRIMARY KEY,
	`amount_minor` integer NOT NULL,
	`deferred_minor` integer DEFAULT 0 NOT NULL,
	`performance_id` text,
	`state` text NOT NULL,
	`releases` integer DEFAULT 0 NOT NULL
);

CREATE TABLE `core_authenticators` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`secret_sealed` text NOT NULL,
	`last_step` integer DEFAULT 0 NOT NULL,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `core_authenticators_account` ON `core_authenticators` (`account_id`);
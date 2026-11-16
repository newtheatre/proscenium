CREATE TABLE `core_signing_keys` (
	`id` text PRIMARY KEY,
	`purpose` text NOT NULL,
	`public_key` text NOT NULL,
	`private_key` text,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`checking_from` integer,
	`retired_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `core_signing_keys_current` ON `core_signing_keys` (`purpose`) WHERE state = 'current';--> statement-breakpoint
CREATE INDEX `core_signing_keys_purpose` ON `core_signing_keys` (`purpose`,`state`);
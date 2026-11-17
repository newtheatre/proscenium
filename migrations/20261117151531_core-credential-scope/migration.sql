ALTER TABLE `core_credentials` ADD `scope` text DEFAULT '' NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_core_credentials` (
	`module_id` text NOT NULL,
	`name` text NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`ciphertext` text NOT NULL,
	`key_version` integer NOT NULL,
	`set_at` integer NOT NULL,
	`set_by` text,
	`last_used_at` integer,
	`expires_at` integer,
	`hint` text,
	CONSTRAINT `core_credentials_pk` PRIMARY KEY(`module_id`, `name`, `scope`)
);
--> statement-breakpoint
INSERT INTO `__new_core_credentials`(`module_id`, `name`, `ciphertext`, `key_version`, `set_at`, `set_by`, `last_used_at`, `expires_at`, `hint`) SELECT `module_id`, `name`, `ciphertext`, `key_version`, `set_at`, `set_by`, `last_used_at`, `expires_at`, `hint` FROM `core_credentials`;--> statement-breakpoint
DROP TABLE `core_credentials`;--> statement-breakpoint
ALTER TABLE `__new_core_credentials` RENAME TO `core_credentials`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
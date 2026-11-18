CREATE TABLE `core_module_defaults` (
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`module_id` text NOT NULL,
	`offered_at` integer NOT NULL,
	CONSTRAINT `core_module_defaults_pk` PRIMARY KEY(`kind`, `key`)
);
--> statement-breakpoint
INSERT OR IGNORE INTO `core_module_defaults` (`kind`, `key`, `module_id`, `offered_at`) SELECT 'role', `preset`, substr(`preset`, 1, instr(`preset`, '.') - 1), `created_at` FROM `core_roles` WHERE `preset` IS NOT NULL AND instr(`preset`, '.') > 1;--> statement-breakpoint
INSERT OR IGNORE INTO `core_module_defaults` (`kind`, `key`, `module_id`, `offered_at`) SELECT 'fact', json_extract(`detail`, '$.fact'), substr(json_extract(`detail`, '$.fact'), 1, instr(json_extract(`detail`, '$.fact'), '.') - 1), min(`at`) FROM `core_audit` WHERE json_valid(`detail`) AND json_extract(`detail`, '$.defaults') = 1 AND instr(json_extract(`detail`, '$.fact'), '.') > 1 GROUP BY json_extract(`detail`, '$.fact');

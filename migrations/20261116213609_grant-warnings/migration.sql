CREATE TABLE `core_grant_warnings` (
	`grant_id` text PRIMARY KEY,
	`warned_at` integer NOT NULL,
	CONSTRAINT `fk_core_grant_warnings_grant_id_core_grants_id_fk` FOREIGN KEY (`grant_id`) REFERENCES `core_grants`(`id`)
);

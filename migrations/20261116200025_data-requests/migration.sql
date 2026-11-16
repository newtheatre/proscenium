CREATE TABLE `core_data_request_checks` (
	`request_id` text NOT NULL,
	`table_name` text NOT NULL,
	`outcome` text NOT NULL,
	`ticked_by` text NOT NULL,
	`ticked_at` integer NOT NULL,
	CONSTRAINT `core_data_request_checks_pk` PRIMARY KEY(`request_id`, `table_name`),
	CONSTRAINT `fk_core_data_request_checks_request_id_core_data_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `core_data_requests`(`id`)
);
--> statement-breakpoint
CREATE TABLE `core_data_requests` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` integer NOT NULL,
	`identity_check` text,
	`respond_by` integer NOT NULL,
	`not_before` integer,
	`holds` text,
	`file_id` text,
	`finished_at` integer,
	`closed_at` integer,
	`closed_by` text
);
--> statement-breakpoint
CREATE INDEX `core_data_requests_account` ON `core_data_requests` (`account_id`,`kind`,`state`);--> statement-breakpoint
CREATE INDEX `core_data_requests_state` ON `core_data_requests` (`state`,`not_before`);
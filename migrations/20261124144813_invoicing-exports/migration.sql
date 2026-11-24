CREATE TABLE `invoicing_export_codes` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`account_id` text NOT NULL,
	`posting_kind` text,
	`code` text,
	`code_name` text DEFAULT '' NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_invoicing_export_codes_profile_id_invoicing_export_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `invoicing_export_profiles`(`id`),
	CONSTRAINT `fk_invoicing_export_codes_account_id_finance_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`),
	CONSTRAINT "invoicing_export_codes_code" CHECK("code" IS NULL OR length("code") BETWEEN 1 AND 50),
	CONSTRAINT "invoicing_export_codes_name" CHECK(length("code_name") <= 80)
);
--> statement-breakpoint
CREATE TABLE `invoicing_export_profiles` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`format` text NOT NULL,
	`granularity` text NOT NULL,
	`columns` text DEFAULT '[]' NOT NULL,
	`date_format` text NOT NULL,
	`signs` text NOT NULL,
	`split_by` text NOT NULL,
	`total_line` text DEFAULT 'none' NOT NULL,
	`total_label` text DEFAULT '' NOT NULL,
	`tax_map` text DEFAULT '{}' NOT NULL,
	`kind_labels` text DEFAULT '{}' NOT NULL,
	`unmapped_code` text DEFAULT 'UNMAPPED' NOT NULL,
	`period_rule` text NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "invoicing_export_profiles_name_length" CHECK(length("name") BETWEEN 1 AND 60),
	CONSTRAINT "invoicing_export_profiles_format" CHECK("format" IN ('journal', 'xero', 'quickbooks', 'sage', 'freeagent', 'custom')),
	CONSTRAINT "invoicing_export_profiles_granularity" CHECK("granularity" IN ('entry', 'daily')),
	CONSTRAINT "invoicing_export_profiles_date_format" CHECK("date_format" IN ('iso', 'dmy', 'mdy')),
	CONSTRAINT "invoicing_export_profiles_signs" CHECK("signs" IN ('split', 'signed', 'credit')),
	CONSTRAINT "invoicing_export_profiles_split_by" CHECK("split_by" IN ('none', 'production', 'source-module')),
	CONSTRAINT "invoicing_export_profiles_period_rule" CHECK("period_rule" IN ('custom', 'period', 'finance-year', 'season')),
	CONSTRAINT "invoicing_export_profiles_unmapped" CHECK(length("unmapped_code") BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE TABLE `invoicing_export_runs` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`from_on` text NOT NULL,
	`to_on` text NOT NULL,
	`rows` integer NOT NULL,
	`unmapped_rows` integer NOT NULL,
	`closed` integer NOT NULL,
	`map_version` text NOT NULL,
	`sha256` text NOT NULL,
	`file_id` text,
	`by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_invoicing_export_runs_profile_id_invoicing_export_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `invoicing_export_profiles`(`id`),
	CONSTRAINT `fk_invoicing_export_runs_file_id_core_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `core_files`(`id`),
	CONSTRAINT "invoicing_export_runs_order" CHECK("to_on" >= "from_on")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoicing_export_codes_account` ON `invoicing_export_codes` (`profile_id`,`account_id`,coalesce("posting_kind", ''));--> statement-breakpoint
CREATE UNIQUE INDEX `invoicing_export_profiles_name` ON `invoicing_export_profiles` (`name`);--> statement-breakpoint
CREATE INDEX `invoicing_export_runs_profile` ON `invoicing_export_runs` (`profile_id`,`created_at`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `invoicing_export_runs_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `invoicing_export_runs_append_only_delete` BEFORE DELETE ON `invoicing_export_runs` BEGIN SELECT RAISE(ABORT, 'append-only: invoicing_export_runs'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `invoicing_export_runs_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `invoicing_export_runs_append_only_update` BEFORE UPDATE ON `invoicing_export_runs` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`profile_id` IS OLD.`profile_id` AND NEW.`from_on` IS OLD.`from_on` AND NEW.`to_on` IS OLD.`to_on` AND NEW.`rows` IS OLD.`rows` AND NEW.`unmapped_rows` IS OLD.`unmapped_rows` AND NEW.`closed` IS OLD.`closed` AND NEW.`map_version` IS OLD.`map_version` AND NEW.`sha256` IS OLD.`sha256` AND NEW.`file_id` IS OLD.`file_id` AND NEW.`by` IS OLD.`by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: invoicing_export_runs'); END;

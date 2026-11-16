CREATE TABLE `core_audit` (
	`id` text PRIMARY KEY,
	`at` integer NOT NULL,
	`actor_account_id` text,
	`actor_name` text,
	`actor_kind` text NOT NULL,
	`action` text NOT NULL,
	`ability` text,
	`allowed_by` text,
	`module_id` text,
	`record_type` text,
	`record_id` text,
	`detail` text,
	`request_id` text,
	`unit_id` text
);
--> statement-breakpoint
CREATE TABLE `core_credentials` (
	`module_id` text NOT NULL,
	`name` text NOT NULL,
	`ciphertext` text NOT NULL,
	`key_version` integer NOT NULL,
	`set_at` integer NOT NULL,
	`set_by` text,
	`last_used_at` integer,
	`expires_at` integer,
	`hint` text,
	CONSTRAINT `core_credentials_pk` PRIMARY KEY(`module_id`, `name`)
);
--> statement-breakpoint
CREATE TABLE `core_events` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`record_type` text,
	`record_id` text,
	`payload` text NOT NULL,
	`announced_at` integer NOT NULL,
	`unit_id` text NOT NULL,
	`dispatched_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_external_calls` (
	`id` text PRIMARY KEY,
	`module_id` text NOT NULL,
	`purpose` text NOT NULL,
	`reference` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`phase` text NOT NULL,
	`result` text,
	`provider_reference` text,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `core_guard` (
	`ok` integer NOT NULL,
	`code` text
);
--> statement-breakpoint
CREATE TABLE `core_idempotency_keys` (
	`key` text NOT NULL,
	`route` text NOT NULL,
	`account_id` text,
	`request_hash` text NOT NULL,
	`status` integer NOT NULL,
	`response` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `core_idempotency_keys_pk` PRIMARY KEY(`key`, `route`)
);
--> statement-breakpoint
CREATE TABLE `core_jobs` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`module_id` text,
	`lane` text NOT NULL,
	`payload` text NOT NULL,
	`dedupe_key` text,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer NOT NULL,
	`run_after` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_migrations` (
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`checksum` text NOT NULL,
	`applied_at` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`release` text NOT NULL,
	CONSTRAINT `core_migrations_pk` PRIMARY KEY(`owner`, `name`)
);
--> statement-breakpoint
CREATE TABLE `core_modules` (
	`module_id` text PRIMARY KEY,
	`enabled` integer DEFAULT false NOT NULL,
	`enabled_at` integer,
	`disabled_at` integer,
	`changed_by` text,
	`manifest_seen` text
);
--> statement-breakpoint
CREATE TABLE `core_setting_changes` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`reason` text,
	`at` integer NOT NULL,
	`actor` text
);
--> statement-breakpoint
CREATE TABLE `core_settings` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `core_task_runs` (
	`task` text NOT NULL,
	`due_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`outcome` text,
	`job_id` text,
	CONSTRAINT `core_task_runs_pk` PRIMARY KEY(`task`, `due_at`)
);
--> statement-breakpoint
CREATE INDEX `core_audit_record` ON `core_audit` (`record_type`,`record_id`,`at`);--> statement-breakpoint
CREATE INDEX `core_audit_actor` ON `core_audit` (`actor_account_id`,`at`);--> statement-breakpoint
CREATE INDEX `core_events_name` ON `core_events` (`name`,`announced_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_external_calls_attempt` ON `core_external_calls` (`idempotency_key`) WHERE phase = 'attempt';--> statement-breakpoint
CREATE UNIQUE INDEX `core_external_calls_outcome` ON `core_external_calls` (`idempotency_key`) WHERE phase = 'outcome' AND result != 'unknown';--> statement-breakpoint
CREATE UNIQUE INDEX `core_jobs_dedupe` ON `core_jobs` (`name`,`dedupe_key`) WHERE dedupe_key IS NOT NULL AND state IN ('queued', 'running');--> statement-breakpoint
CREATE INDEX `core_jobs_due` ON `core_jobs` (`state`,`run_after`);--> statement-breakpoint
CREATE INDEX `core_setting_changes_key` ON `core_setting_changes` (`key`,`at`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_setting_changes_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_setting_changes_append_only_delete` BEFORE DELETE ON `core_setting_changes` BEGIN SELECT RAISE(ABORT, 'append-only: core_setting_changes'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_setting_changes_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_setting_changes_append_only_update` BEFORE UPDATE ON `core_setting_changes` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`key` IS OLD.`key` AND NEW.`old_value` IS OLD.`old_value` AND NEW.`new_value` IS OLD.`new_value` AND (NEW.`reason` IS OLD.`reason` OR NEW.`reason` IS '[removed]') AND NEW.`at` IS OLD.`at` AND NEW.`actor` IS OLD.`actor`) BEGIN SELECT RAISE(ABORT, 'append-only: core_setting_changes'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_migrations_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_migrations_append_only_delete` BEFORE DELETE ON `core_migrations` BEGIN SELECT RAISE(ABORT, 'append-only: core_migrations'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_migrations_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_migrations_append_only_update` BEFORE UPDATE ON `core_migrations` WHEN NOT (NEW.`owner` IS OLD.`owner` AND NEW.`name` IS OLD.`name` AND NEW.`checksum` IS OLD.`checksum` AND NEW.`applied_at` IS OLD.`applied_at` AND NEW.`duration_ms` IS OLD.`duration_ms` AND NEW.`release` IS OLD.`release`) BEGIN SELECT RAISE(ABORT, 'append-only: core_migrations'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_external_calls_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_external_calls_append_only_delete` BEFORE DELETE ON `core_external_calls` BEGIN SELECT RAISE(ABORT, 'append-only: core_external_calls'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_external_calls_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_external_calls_append_only_update` BEFORE UPDATE ON `core_external_calls` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`module_id` IS OLD.`module_id` AND NEW.`purpose` IS OLD.`purpose` AND NEW.`reference` IS OLD.`reference` AND NEW.`idempotency_key` IS OLD.`idempotency_key` AND NEW.`phase` IS OLD.`phase` AND NEW.`result` IS OLD.`result` AND NEW.`provider_reference` IS OLD.`provider_reference` AND NEW.`at` IS OLD.`at`) BEGIN SELECT RAISE(ABORT, 'append-only: core_external_calls'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_audit_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_audit_append_only_delete` BEFORE DELETE ON `core_audit` BEGIN SELECT RAISE(ABORT, 'append-only: core_audit'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_audit_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_audit_append_only_update` BEFORE UPDATE ON `core_audit` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`at` IS OLD.`at` AND NEW.`actor_account_id` IS OLD.`actor_account_id` AND (NEW.`actor_name` IS OLD.`actor_name` OR NEW.`actor_name` IS 'Former member') AND NEW.`actor_kind` IS OLD.`actor_kind` AND NEW.`action` IS OLD.`action` AND NEW.`ability` IS OLD.`ability` AND NEW.`allowed_by` IS OLD.`allowed_by` AND NEW.`module_id` IS OLD.`module_id` AND NEW.`record_type` IS OLD.`record_type` AND NEW.`record_id` IS OLD.`record_id` AND NEW.`detail` IS OLD.`detail` AND NEW.`request_id` IS OLD.`request_id` AND NEW.`unit_id` IS OLD.`unit_id`) BEGIN SELECT RAISE(ABORT, 'append-only: core_audit'); END;
--> statement-breakpoint
CREATE TRIGGER `core_guard_check` BEFORE INSERT ON `core_guard` BEGIN SELECT CASE WHEN NEW.ok = 1 THEN RAISE(IGNORE) ELSE RAISE(ABORT, 'guard:' || coalesce(NEW.code, '')) END; END;

CREATE TABLE `core_account_emails` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`address` text NOT NULL,
	`verified_at` integer,
	`added_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `core_account_merge_items` (
	`merge_id` text NOT NULL,
	`table_name` text NOT NULL,
	`column_name` text NOT NULL,
	`row_id` text NOT NULL,
	`action` text NOT NULL,
	CONSTRAINT `core_account_merge_items_pk` PRIMARY KEY(`merge_id`, `table_name`, `column_name`, `row_id`),
	CONSTRAINT `fk_core_account_merge_items_merge_id_core_account_merges_id_fk` FOREIGN KEY (`merge_id`) REFERENCES `core_account_merges`(`id`)
);
--> statement-breakpoint
CREATE TABLE `core_account_merges` (
	`id` text PRIMARY KEY,
	`winner_id` text NOT NULL,
	`loser_id` text NOT NULL,
	`started_by` text NOT NULL,
	`performed_by` text NOT NULL,
	`performed_at` integer NOT NULL,
	`undo_until` integer NOT NULL,
	`undone_at` integer,
	`undone_by` text
);
--> statement-breakpoint
CREATE TABLE `core_account_tokens` (
	`id` text PRIMARY KEY,
	`purpose` text NOT NULL,
	`token_hash` text NOT NULL,
	`code_hash` text,
	`browser_hash` text,
	`account_id` text,
	`address` text,
	`issued_by` text,
	`next_path` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_accounts` (
	`id` text PRIMARY KEY,
	`name` text,
	`preferred_name` text,
	`pronouns` text,
	`phone` text,
	`locale` text,
	`audience_email_id` text,
	`members_email_id` text,
	`origin` text NOT NULL,
	`created_at` integer NOT NULL,
	`first_signed_in_at` integer,
	`last_signed_in_at` integer,
	`disabled_at` integer,
	`disabled_reason` text,
	`merged_into_id` text,
	`merged_at` integer,
	`anonymised_at` integer,
	CONSTRAINT "core_accounts_not_merged_into_itself" CHECK(merged_into_id IS NULL OR merged_into_id <> id),
	CONSTRAINT "core_accounts_name_length" CHECK(name IS NULL OR length(name) BETWEEN 1 AND 120),
	CONSTRAINT "core_accounts_preferred_name_length" CHECK(preferred_name IS NULL OR length(preferred_name) <= 60),
	CONSTRAINT "core_accounts_pronouns_length" CHECK(pronouns IS NULL OR length(pronouns) BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE TABLE `core_fact_abilities` (
	`fact` text NOT NULL,
	`ability` text NOT NULL,
	`pinned_record` text DEFAULT '' NOT NULL,
	`confirmed_privileged_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `core_fact_abilities_pk` PRIMARY KEY(`fact`, `ability`, `pinned_record`)
);
--> statement-breakpoint
CREATE TABLE `core_federated_identities` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`provider` text NOT NULL,
	`subject` text NOT NULL,
	`hosted_domain` text,
	`email_id` text,
	`linked_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_grant_ends` (
	`grant_id` text NOT NULL,
	`ended_at` integer NOT NULL,
	`ended_by` text,
	`ended_reason` text NOT NULL,
	CONSTRAINT `fk_core_grant_ends_grant_id_core_grants_id_fk` FOREIGN KEY (`grant_id`) REFERENCES `core_grants`(`id`)
);
--> statement-breakpoint
CREATE TABLE `core_grants` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`role_id` text NOT NULL,
	`scope` text NOT NULL,
	`scope_module` text,
	`scope_type` text,
	`scope_id` text,
	`starts_at` integer NOT NULL,
	`expires_at` integer,
	`granted_by` text NOT NULL,
	`granted_at` integer NOT NULL,
	CONSTRAINT `fk_core_grants_role_id_core_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `core_roles`(`id`),
	CONSTRAINT "core_grants_scope" CHECK((scope = 'site' AND scope_module IS NULL AND scope_type IS NULL AND scope_id IS NULL)
      OR (scope = 'module' AND scope_module IS NOT NULL AND scope_type IS NULL AND scope_id IS NULL)
      OR (scope = 'record' AND scope_module IS NOT NULL AND scope_type IS NOT NULL AND scope_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `core_passkey_challenges` (
	`id` text PRIMARY KEY,
	`purpose` text NOT NULL,
	`challenge` text NOT NULL,
	`account_id` text,
	`session_id` text,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_passkeys` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`sign_count` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`authenticator` text,
	`synced` integer DEFAULT false NOT NULL,
	`label` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_recovery_codes` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE TABLE `core_role_abilities` (
	`role_id` text NOT NULL,
	`ability` text NOT NULL,
	CONSTRAINT `core_role_abilities_pk` PRIMARY KEY(`role_id`, `ability`),
	CONSTRAINT `fk_core_role_abilities_role_id_core_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `core_roles`(`id`)
);
--> statement-breakpoint
CREATE TABLE `core_roles` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`fixed` integer DEFAULT false NOT NULL,
	`opens_members_area` integer DEFAULT false NOT NULL,
	`needs_managed_identity` integer DEFAULT false NOT NULL,
	`expiry_rule` text NOT NULL,
	`expiry_days` integer,
	`preset` text,
	`created_at` integer NOT NULL,
	`archived_at` integer,
	CONSTRAINT "core_roles_expiry_days" CHECK((expiry_rule = 'days') = (expiry_days IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `core_sessions` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`methods` text NOT NULL,
	`assurance` text NOT NULL,
	`reasserted_at` integer,
	`device` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ended_at` integer,
	`ended_reason` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `core_account_emails_address` ON `core_account_emails` (`address`);--> statement-breakpoint
CREATE INDEX `core_account_emails_account` ON `core_account_emails` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_account_merges_loser` ON `core_account_merges` (`loser_id`) WHERE undone_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `core_account_tokens_hash` ON `core_account_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `core_account_tokens_address` ON `core_account_tokens` (`purpose`,`address`,`created_at`);--> statement-breakpoint
CREATE INDEX `core_account_tokens_expiry` ON `core_account_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `core_accounts_merged_into` ON `core_accounts` (`merged_into_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_federated_identities_subject` ON `core_federated_identities` (`provider`,`subject`);--> statement-breakpoint
CREATE INDEX `core_federated_identities_account` ON `core_federated_identities` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_grant_ends_grant` ON `core_grant_ends` (`grant_id`);--> statement-breakpoint
CREATE INDEX `core_grants_account` ON `core_grants` (`account_id`);--> statement-breakpoint
CREATE INDEX `core_grants_role` ON `core_grants` (`role_id`);--> statement-breakpoint
CREATE INDEX `core_passkey_challenges_expiry` ON `core_passkey_challenges` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_passkeys_credential` ON `core_passkeys` (`credential_id`);--> statement-breakpoint
CREATE INDEX `core_passkeys_account` ON `core_passkeys` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_recovery_codes_hash` ON `core_recovery_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `core_recovery_codes_account` ON `core_recovery_codes` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_roles_key` ON `core_roles` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_sessions_token` ON `core_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `core_sessions_account` ON `core_sessions` (`account_id`,`ended_at`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_grants_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_grants_append_only_delete` BEFORE DELETE ON `core_grants` BEGIN SELECT RAISE(ABORT, 'append-only: core_grants'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_grants_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_grants_append_only_update` BEFORE UPDATE ON `core_grants` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`account_id` IS OLD.`account_id` AND NEW.`role_id` IS OLD.`role_id` AND NEW.`scope` IS OLD.`scope` AND NEW.`scope_module` IS OLD.`scope_module` AND NEW.`scope_type` IS OLD.`scope_type` AND NEW.`scope_id` IS OLD.`scope_id` AND NEW.`starts_at` IS OLD.`starts_at` AND NEW.`expires_at` IS OLD.`expires_at` AND NEW.`granted_by` IS OLD.`granted_by` AND NEW.`granted_at` IS OLD.`granted_at`) BEGIN SELECT RAISE(ABORT, 'append-only: core_grants'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_grant_ends_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `core_grant_ends_append_only_delete` BEFORE DELETE ON `core_grant_ends` BEGIN SELECT RAISE(ABORT, 'append-only: core_grant_ends'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `core_grant_ends_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `core_grant_ends_append_only_update` BEFORE UPDATE ON `core_grant_ends` WHEN NOT (NEW.`grant_id` IS OLD.`grant_id` AND NEW.`ended_at` IS OLD.`ended_at` AND NEW.`ended_by` IS OLD.`ended_by` AND NEW.`ended_reason` IS OLD.`ended_reason`) BEGIN SELECT RAISE(ABORT, 'append-only: core_grant_ends'); END;
--> statement-breakpoint
CREATE TRIGGER `core_accounts_never_deleted` BEFORE DELETE ON `core_accounts` BEGIN SELECT RAISE(ABORT, 'identity: an account is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `core_accounts_tombstone` BEFORE UPDATE ON `core_accounts` WHEN OLD.`anonymised_at` IS NOT NULL AND (NEW.`anonymised_at` IS NULL OR NEW.`name` IS NOT NULL OR NEW.`preferred_name` IS NOT NULL OR NEW.`pronouns` IS NOT NULL OR NEW.`phone` IS NOT NULL OR NEW.`last_signed_in_at` IS NOT NULL) BEGIN SELECT RAISE(ABORT, 'identity: nothing personal is written to an erased account'); END;
--> statement-breakpoint
CREATE TRIGGER `core_grants_not_to_oneself` BEFORE INSERT ON `core_grants` WHEN NEW.`granted_by` IS NEW.`account_id` AND EXISTS (SELECT 1 FROM `core_grants`) BEGIN SELECT RAISE(ABORT, 'identity: nobody grants themselves a role'); END;

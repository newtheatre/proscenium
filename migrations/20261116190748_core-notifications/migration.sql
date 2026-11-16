CREATE TABLE `core_email_suppressions` (
	`address_hash` text PRIMARY KEY,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`lifted_at` integer,
	`lifted_by` text,
	CONSTRAINT "core_email_suppressions_reason" CHECK("reason" IN ('hard_bounce', 'complaint', 'manual'))
);
--> statement-breakpoint
CREATE TABLE `core_inbox_items` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`delivery_id` text,
	`side` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`read_at` integer,
	`archived_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_core_inbox_items_delivery_id_core_notification_deliveries_id_fk` FOREIGN KEY (`delivery_id`) REFERENCES `core_notification_deliveries`(`id`) ON DELETE SET NULL,
	CONSTRAINT "core_inbox_items_side" CHECK("side" IN ('audience', 'members')),
	CONSTRAINT "core_inbox_items_title" CHECK(length("title") BETWEEN 1 AND 120),
	CONSTRAINT "core_inbox_items_body" CHECK("body" IS NULL OR length("body") <= 500)
);
--> statement-breakpoint
CREATE TABLE `core_notification_deliveries` (
	`id` text PRIMARY KEY,
	`notification_id` text NOT NULL,
	`side` text NOT NULL,
	`channel` text NOT NULL,
	`state` text NOT NULL,
	`reason` text,
	`template_id` text,
	`sender_key` text,
	`provider_ref` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`rolled_into_id` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_core_notification_deliveries_notification_id_core_notifications_id_fk` FOREIGN KEY (`notification_id`) REFERENCES `core_notifications`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_notification_deliveries_sender_key_core_sender_identities_key_fk` FOREIGN KEY (`sender_key`) REFERENCES `core_sender_identities`(`key`) ON DELETE RESTRICT,
	CONSTRAINT `fk_core_notification_deliveries_rolled_into_id_core_notifications_id_fk` FOREIGN KEY (`rolled_into_id`) REFERENCES `core_notifications`(`id`) ON DELETE SET NULL,
	CONSTRAINT "core_notification_deliveries_side" CHECK("side" IN ('audience', 'members')),
	CONSTRAINT "core_notification_deliveries_state" CHECK("state" IN ('queued', 'held', 'sending', 'sent', 'retrying', 'failed', 'suppressed', 'skipped', 'bounced', 'complained'))
);
--> statement-breakpoint
CREATE TABLE `core_notification_preferences` (
	`account_id` text NOT NULL,
	`topic_key` text NOT NULL,
	`channel` text NOT NULL,
	`side` text NOT NULL,
	`enabled` integer NOT NULL,
	`digest` text DEFAULT 'immediate' NOT NULL,
	CONSTRAINT `core_notification_preferences_pk` PRIMARY KEY(`account_id`, `topic_key`, `channel`),
	CONSTRAINT "core_notification_preferences_side" CHECK("side" IN ('audience', 'members')),
	CONSTRAINT "core_notification_preferences_digest" CHECK("digest" IN ('immediate', 'daily', 'weekly'))
);
--> statement-breakpoint
CREATE TABLE `core_notifications` (
	`id` text PRIMARY KEY,
	`type_key` text NOT NULL,
	`side` text NOT NULL,
	`account_id` text,
	`address` text,
	`locale` text NOT NULL,
	`subject_type` text,
	`subject_id` text,
	`dedupe_key` text,
	`coalesce_key` text,
	`payload` text,
	`actor_id` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "core_notifications_side" CHECK("side" IN ('audience', 'members')),
	CONSTRAINT "core_notifications_recipient" CHECK(("account_id" IS NULL) <> ("address" IS NULL) OR "payload" IS NULL)
);
--> statement-breakpoint
CREATE INDEX `core_inbox_items_account` ON `core_inbox_items` (`account_id`,`side`,`archived_at`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_notification_deliveries_channel` ON `core_notification_deliveries` (`notification_id`,`channel`);--> statement-breakpoint
CREATE INDEX `core_notification_deliveries_due` ON `core_notification_deliveries` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `core_notification_deliveries_provider` ON `core_notification_deliveries` (`provider_ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_notifications_dedupe` ON `core_notifications` (`dedupe_key`) WHERE "core_notifications"."dedupe_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `core_notifications_subject` ON `core_notifications` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `core_notifications_account` ON `core_notifications` (`account_id`,`created_at`);
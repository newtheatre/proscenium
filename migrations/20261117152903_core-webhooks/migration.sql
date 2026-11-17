CREATE TABLE `core_webhook_deliveries` (
	`id` text PRIMARY KEY,
	`webhook_id` text NOT NULL,
	`event_id` text NOT NULL,
	`event_name` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`response_status` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	CONSTRAINT `fk_core_webhook_deliveries_webhook_id_core_webhooks_id_fk` FOREIGN KEY (`webhook_id`) REFERENCES `core_webhooks`(`id`) ON DELETE CASCADE,
	CONSTRAINT "core_webhook_deliveries_state" CHECK("state" IN ('queued', 'sending', 'sent', 'retrying', 'failed'))
);
--> statement-breakpoint
CREATE TABLE `core_webhooks` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`format` text NOT NULL,
	`url` text NOT NULL,
	`url_hint` text NOT NULL,
	`secret` text,
	`events` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`last_success_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "core_webhooks_name_length" CHECK(length("name") BETWEEN 1 AND 60),
	CONSTRAINT "core_webhooks_format" CHECK("format" IN ('json', 'discord', 'slack')),
	CONSTRAINT "core_webhooks_secret" CHECK("format" <> 'json' OR "secret" IS NOT NULL),
	CONSTRAINT "core_webhooks_state" CHECK("state" IN ('active', 'paused', 'failing'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `core_webhook_deliveries_event` ON `core_webhook_deliveries` (`webhook_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `core_webhook_deliveries_due` ON `core_webhook_deliveries` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `core_webhook_deliveries_log` ON `core_webhook_deliveries` (`webhook_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_webhooks_name` ON `core_webhooks` (lower("name"));
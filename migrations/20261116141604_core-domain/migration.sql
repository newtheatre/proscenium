CREATE TABLE `core_files` (
	`id` text PRIMARY KEY,
	`object_key` text NOT NULL UNIQUE,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`slot` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`original_name` text,
	`text_class` text NOT NULL,
	`title` text,
	`alt_text` text,
	`media_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sha256` text NOT NULL,
	`width` integer,
	`height` integer,
	`access` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`rejected_reason` text,
	`uploaded_by` text,
	`created_at` integer NOT NULL,
	`ready_at` integer,
	`attached_at` integer,
	`deleted_at` integer,
	`purge_after` integer,
	CONSTRAINT "core_files_byte_size" CHECK("byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE `core_notification_routing` (
	`topic_key` text PRIMARY KEY,
	`sender_key` text NOT NULL,
	CONSTRAINT `fk_core_notification_routing_sender_key_core_sender_identities_key_fk` FOREIGN KEY (`sender_key`) REFERENCES `core_sender_identities`(`key`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `core_sender_identities` (
	`key` text PRIMARY KEY,
	`display_name` text NOT NULL,
	`local_part` text NOT NULL,
	`reply_to` text,
	`state` text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `core_files_owner` ON `core_files` (`owner_type`,`owner_id`,`slot`,`sort`);--> statement-breakpoint
CREATE INDEX `core_files_purge` ON `core_files` (`state`,`purge_after`);--> statement-breakpoint
CREATE UNIQUE INDEX `core_sender_identities_local_part` ON `core_sender_identities` (`local_part`);
CREATE TABLE `core_email_events_set_aside` (
	`queue_message_id` text PRIMARY KEY,
	`event_type` text,
	`reason` text NOT NULL,
	`set_aside_at` integer NOT NULL,
	CONSTRAINT "core_email_events_set_aside_type" CHECK("event_type" IS NULL OR "event_type" IN ('delivered', 'deferred', 'bounced', 'failed', 'rejected', 'complained')),
	CONSTRAINT "core_email_events_set_aside_reason" CHECK("reason" IN ('unreadable', 'unmatched'))
);
--> statement-breakpoint
CREATE INDEX `core_email_events_set_aside_at` ON `core_email_events_set_aside` (`set_aside_at`);
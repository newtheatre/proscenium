CREATE TABLE `sumup_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`till_session_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`night` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`basket` text NOT NULL,
	`expected_total_pence` integer NOT NULL,
	`status` text DEFAULT 'STARTED' NOT NULL,
	`smp_status` text,
	`smp_tx_code` text,
	`smp_message` text,
	`smp_failure_cause` text,
	`callback_at` integer,
	`resolution` text,
	`resolved_by` text,
	`resolved_at` integer,
	`resolution_note` text,
	`entry_id` text,
	`error` text,
	FOREIGN KEY (`till_session_id`) REFERENCES `till_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sumup_attempts_status_values" CHECK("sumup_attempts"."status" IN ('STARTED', 'COMPLETING', 'SUCCEEDED', 'FAILED', 'ABANDONED', 'MISMATCH')),
	CONSTRAINT "sumup_attempts_resolution_values" CHECK("sumup_attempts"."resolution" IS NULL OR "sumup_attempts"."resolution" IN ('CALLBACK', 'KEY', 'STAFF', 'SWEEP')),
	CONSTRAINT "sumup_attempts_entry_needs_success" CHECK("sumup_attempts"."entry_id" IS NULL OR "sumup_attempts"."status" = 'SUCCEEDED')
);
--> statement-breakpoint
CREATE INDEX `sumup_attempts_night_status` ON `sumup_attempts` (`night`,`status`);--> statement-breakpoint
CREATE INDEX `sumup_attempts_session` ON `sumup_attempts` (`till_session_id`);
CREATE TABLE `training_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`module_id` text NOT NULL,
	`awarded_on` text NOT NULL,
	`expires_on` text,
	`expiry_overridden` integer DEFAULT false NOT NULL,
	`source` text NOT NULL,
	`session_id` text,
	`granted_by` text,
	`evidence_ref` text,
	`revoked_at` integer,
	`revoked_by` text,
	`revoke_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`revoked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "training_records_source" CHECK("training_records"."source" IN ('SESSION', 'SIGNOFF', 'EXTERNAL', 'SELF', 'LEGACY')),
	CONSTRAINT "training_records_term" CHECK("training_records"."expires_on" IS NULL OR "training_records"."expires_on" > "training_records"."awarded_on")
);
--> statement-breakpoint
CREATE INDEX `training_records_user_module` ON `training_records` (`user_id`,`module_id`);--> statement-breakpoint
CREATE INDEX `training_records_module` ON `training_records` (`module_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `training_records_session_award` ON `training_records` (`session_id`,`user_id`,`module_id`) WHERE session_id is not null and revoked_at is null;
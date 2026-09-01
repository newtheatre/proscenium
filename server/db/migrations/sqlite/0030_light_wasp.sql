CREATE TABLE `external_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`space_id` text NOT NULL,
	`outcome` text NOT NULL,
	`reason` text,
	`recorded_by` text,
	`recorded_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `external_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `external_spaces`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "external_assignments_outcome" CHECK("external_assignments"."outcome" IN ('ACCEPTED', 'REFUSED'))
);
--> statement-breakpoint
CREATE INDEX `external_assignments_request` ON `external_assignments` (`request_id`);--> statement-breakpoint
CREATE TABLE `external_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`purpose` text NOT NULL,
	`attendees` integer,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`preferred_space_id` text,
	`assigned_space_id` text,
	`notes` text,
	`su_reference` text,
	`status` text DEFAULT 'REQUESTED' NOT NULL,
	`submitted_at` integer,
	`submitted_by` text,
	`decided_at` integer,
	`decided_by` text,
	`rejection_reason` text,
	`escalated_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`preferred_space_id`) REFERENCES `external_spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_space_id`) REFERENCES `external_spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "external_requests_span" CHECK("external_requests"."ends_at" > "external_requests"."starts_at"),
	CONSTRAINT "external_requests_status" CHECK("external_requests"."status" IN ('REQUESTED', 'AWAITING_EXTERNAL', 'CONFIRMED', 'REJECTED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE INDEX `external_requests_status` ON `external_requests` (`status`);--> statement-breakpoint
CREATE INDEX `external_requests_user` ON `external_requests` (`user_id`);
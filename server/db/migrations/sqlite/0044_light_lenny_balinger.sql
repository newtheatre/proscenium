CREATE TABLE `session_attendees` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'SIGNED_UP' NOT NULL,
	`source` text DEFAULT 'SIGNUP' NOT NULL,
	`signed_up_at` integer DEFAULT (unixepoch()) NOT NULL,
	`marked_at` integer,
	`marked_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `training_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`marked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "session_attendees_status" CHECK("session_attendees"."status" IN ('SIGNED_UP', 'CANCELLED', 'ATTENDED', 'ABSENT')),
	CONSTRAINT "session_attendees_source" CHECK("session_attendees"."source" IN ('SIGNUP', 'WALK_IN'))
);
--> statement-breakpoint
CREATE INDEX `session_attendees_order` ON `session_attendees` (`session_id`,`signed_up_at`);--> statement-breakpoint
CREATE INDEX `session_attendees_user` ON `session_attendees` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_attendees_person` ON `session_attendees` (`session_id`,`user_id`);
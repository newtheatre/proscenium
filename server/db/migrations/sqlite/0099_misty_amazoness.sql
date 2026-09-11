CREATE TABLE `membership_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`student_id` text NOT NULL,
	`starts_on` text NOT NULL,
	`term` integer NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`reason` text,
	`decided_by` text,
	`decided_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "membership_claims_status" CHECK("membership_claims"."status" IN ('OPEN', 'RECORDED', 'DECLINED', 'WITHDRAWN')),
	CONSTRAINT "membership_claims_term" CHECK("membership_claims"."term" IN (1, 3))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_claims_open` ON `membership_claims` (`user_id`) WHERE status = 'OPEN';--> statement-breakpoint
CREATE INDEX `membership_claims_status_created` ON `membership_claims` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `membership_claims_user` ON `membership_claims` (`user_id`);
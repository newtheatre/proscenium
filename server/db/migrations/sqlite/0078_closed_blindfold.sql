CREATE TABLE `comp_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`night` text NOT NULL,
	`requested_by` text NOT NULL,
	`reason` text NOT NULL,
	`lines` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`decline_reason` text,
	`entry_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "comp_requests_status_values" CHECK("comp_requests"."status" IN ('PENDING', 'APPROVED', 'DECLINED')),
	CONSTRAINT "comp_requests_decided_shape" CHECK(
    ("comp_requests"."status" = 'PENDING' AND "comp_requests"."decided_by" IS NULL AND "comp_requests"."decided_at" IS NULL)
    OR ("comp_requests"."status" <> 'PENDING' AND "comp_requests"."decided_by" IS NOT NULL AND "comp_requests"."decided_at" IS NOT NULL)
  ),
	CONSTRAINT "comp_requests_decline_reason_shape" CHECK(("comp_requests"."status" = 'DECLINED') = ("comp_requests"."decline_reason" IS NOT NULL)),
	CONSTRAINT "comp_requests_entry_needs_approval" CHECK("comp_requests"."entry_id" IS NULL OR "comp_requests"."status" = 'APPROVED')
);
--> statement-breakpoint
CREATE INDEX `comp_requests_venue_night` ON `comp_requests` (`venue_id`,`night`);
CREATE TABLE `ticket_comp_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`decline_reason` text,
	`entry_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ticket_comp_requests_status_values" CHECK("ticket_comp_requests"."status" IN ('PENDING', 'APPROVED', 'DECLINED')),
	CONSTRAINT "ticket_comp_requests_decided_shape" CHECK(
    ("ticket_comp_requests"."status" = 'PENDING' AND "ticket_comp_requests"."decided_by" IS NULL AND "ticket_comp_requests"."decided_at" IS NULL)
    OR ("ticket_comp_requests"."status" <> 'PENDING' AND "ticket_comp_requests"."decided_by" IS NOT NULL AND "ticket_comp_requests"."decided_at" IS NOT NULL)
  ),
	CONSTRAINT "ticket_comp_requests_decline_reason_shape" CHECK(("ticket_comp_requests"."status" = 'DECLINED') = ("ticket_comp_requests"."decline_reason" IS NOT NULL)),
	CONSTRAINT "ticket_comp_requests_entry_needs_approval" CHECK("ticket_comp_requests"."entry_id" IS NULL OR "ticket_comp_requests"."status" = 'APPROVED')
);
--> statement-breakpoint
CREATE INDEX `ticket_comp_requests_reservation` ON `ticket_comp_requests` (`reservation_id`);--> statement-breakpoint
CREATE INDEX `ticket_comp_requests_performance` ON `ticket_comp_requests` (`performance_id`);
CREATE TABLE `comp_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_session_id` text,
	`night` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`requested_at` text DEFAULT (current_timestamp) NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`lines` text NOT NULL,
	`gross_pence` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`decided_by_user_id` text,
	`decided_at` text,
	`transaction_id` text,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `comp_requests_night_status_idx` ON `comp_requests` (`night`,`status`);--> statement-breakpoint
CREATE INDEX `comp_requests_requester_idx` ON `comp_requests` (`requested_by_user_id`,`status`);
CREATE TABLE `waiting_list` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`user_id` text NOT NULL,
	`party_size` integer NOT NULL,
	`status` text DEFAULT 'WAITING' NOT NULL,
	`offered_at` integer,
	`offer_expires_at` integer,
	`claimed_reservation_id` text,
	`removed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`claimed_reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "waiting_list_status_values" CHECK("waiting_list"."status" IN ('WAITING', 'OFFERED', 'CLAIMED', 'LAPSED', 'REMOVED')),
	CONSTRAINT "waiting_list_party_size" CHECK("waiting_list"."party_size" BETWEEN 1 AND 10),
	CONSTRAINT "waiting_list_offer_pair" CHECK(("waiting_list"."offered_at" IS NULL) = ("waiting_list"."offer_expires_at" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `waiting_list_performance_status_created` ON `waiting_list` (`performance_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `waiting_list_performance_user_active` ON `waiting_list` (`performance_id`,`user_id`) WHERE status IN ('WAITING', 'OFFERED');
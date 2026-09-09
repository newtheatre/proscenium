CREATE TABLE `pass_admissions` (
	`id` text PRIMARY KEY NOT NULL,
	`pass_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`admitted_at` integer DEFAULT (unixepoch()) NOT NULL,
	`admitted_by` text,
	FOREIGN KEY (`pass_id`) REFERENCES `passes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`admitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `pass_admissions_pass` ON `pass_admissions` (`pass_id`);--> statement-breakpoint
CREATE INDEX `pass_admissions_performance` ON `pass_admissions` (`performance_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pass_admissions_ticket` ON `pass_admissions` (`ticket_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pass_admissions_pass_performance` ON `pass_admissions` (`pass_id`,`performance_id`);--> statement-breakpoint
CREATE TABLE `pass_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`pass_type_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`note` text,
	`decided_by` text,
	`pass_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`pass_type_id`) REFERENCES `pass_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pass_id`) REFERENCES `passes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "pass_requests_status_values" CHECK("pass_requests"."status" IN ('PENDING', 'FULFILLED', 'DECLINED', 'EXPIRED')),
	CONSTRAINT "pass_requests_pass_pairs_with_fulfilled" CHECK(("pass_requests"."status" = 'FULFILLED') = ("pass_requests"."pass_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `pass_requests_pass_type_status` ON `pass_requests` (`pass_type_id`,`status`);--> statement-breakpoint
CREATE INDEX `pass_requests_user` ON `pass_requests` (`user_id`);--> statement-breakpoint
CREATE TABLE `passes` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`pass_type_id` text NOT NULL,
	`pass_type_price_id` text NOT NULL,
	`user_id` text NOT NULL,
	`price_paid` integer NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`issued_by` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`pass_type_id`) REFERENCES `pass_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pass_type_price_id`) REFERENCES `pass_type_prices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "passes_status_values" CHECK("passes"."status" IN ('ACTIVE', 'CANCELLED', 'EXPIRED')),
	CONSTRAINT "passes_price_paid_pence" CHECK("passes"."price_paid" >= 0)
);
--> statement-breakpoint
CREATE INDEX `passes_user` ON `passes` (`user_id`);--> statement-breakpoint
CREATE INDEX `passes_pass_type` ON `passes` (`pass_type_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `passes_reference` ON `passes` (`reference`);--> statement-breakpoint
-- Append-only is trigger-enforced, not a convention (decision 0010). An admission is defended
-- after the fact: there is no correcting entry, since revoking one is D-125/D-126's job on `passes` itself.
CREATE TRIGGER pass_admissions_no_update
BEFORE UPDATE ON pass_admissions
BEGIN
  SELECT RAISE(ABORT, 'pass_admissions is append-only: it is the record that admission happened');
END;
--> statement-breakpoint
CREATE TRIGGER pass_admissions_no_delete
BEFORE DELETE ON pass_admissions
BEGIN
  SELECT RAISE(ABORT, 'pass_admissions is append-only: it is the record that admission happened');
END;
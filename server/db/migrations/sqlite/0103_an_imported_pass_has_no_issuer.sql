-- Hand-authored rebuild (0073, docs/decisions/0063-hand-authored-table-rebuilds.md): `passes.issued_by`
-- becomes nullable, since a pass the import reconstructs from an old sale or admission has no
-- recorded issuer. Only `passes` rebuilds in place: `pass_admissions` and `pass_requests` both
-- carry a live restrict FK onto it, so each is held, dropped, and recreated after `passes` exists
-- in its new shape, `pass_admissions` with its own append-only triggers re-created by hand. The
-- ordering was verified against a real three-table fixture, not reasoned about.
CREATE TABLE `__hold_pass_requests` AS SELECT * FROM `pass_requests`;
--> statement-breakpoint
DROP TABLE `pass_requests`;
--> statement-breakpoint
CREATE TABLE `__hold_pass_admissions` AS SELECT * FROM `pass_admissions`;
--> statement-breakpoint
DROP TABLE `pass_admissions`;
--> statement-breakpoint
CREATE TABLE `__new_passes` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`pass_type_id` text NOT NULL,
	`pass_type_price_id` text NOT NULL,
	`user_id` text NOT NULL,
	`price_paid` integer NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`issued_by` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`pass_type_id`) REFERENCES `pass_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pass_type_price_id`) REFERENCES `pass_type_prices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "passes_status_values" CHECK("__new_passes"."status" IN ('ACTIVE', 'CANCELLED', 'EXPIRED')),
	CONSTRAINT "passes_price_paid_pence" CHECK("__new_passes"."price_paid" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_passes` (
	`id`, `reference`, `pass_type_id`, `pass_type_price_id`, `user_id`, `price_paid`, `status`, `issued_by`, `notes`, `created_at`, `updated_at`
)
SELECT
	`id`, `reference`, `pass_type_id`, `pass_type_price_id`, `user_id`, `price_paid`, `status`, `issued_by`, `notes`, `created_at`, `updated_at`
FROM `passes`;
--> statement-breakpoint
DROP TABLE `passes`;
--> statement-breakpoint
ALTER TABLE `__new_passes` RENAME TO `passes`;
--> statement-breakpoint
CREATE INDEX `passes_user` ON `passes` (`user_id`);
--> statement-breakpoint
CREATE INDEX `passes_pass_type` ON `passes` (`pass_type_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `passes_reference` ON `passes` (`reference`);
--> statement-breakpoint
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
INSERT INTO `pass_admissions` (`id`, `pass_id`, `performance_id`, `ticket_id`, `admitted_at`, `admitted_by`)
SELECT `id`, `pass_id`, `performance_id`, `ticket_id`, `admitted_at`, `admitted_by` FROM `__hold_pass_admissions`;
--> statement-breakpoint
DROP TABLE `__hold_pass_admissions`;
--> statement-breakpoint
CREATE INDEX `pass_admissions_pass` ON `pass_admissions` (`pass_id`);
--> statement-breakpoint
CREATE INDEX `pass_admissions_performance` ON `pass_admissions` (`performance_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `pass_admissions_ticket` ON `pass_admissions` (`ticket_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `pass_admissions_pass_performance` ON `pass_admissions` (`pass_id`,`performance_id`);
--> statement-breakpoint
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
--> statement-breakpoint
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
INSERT INTO `pass_requests` (`id`, `pass_type_id`, `user_id`, `status`, `note`, `decided_by`, `pass_id`, `created_at`, `decided_at`)
SELECT `id`, `pass_type_id`, `user_id`, `status`, `note`, `decided_by`, `pass_id`, `created_at`, `decided_at` FROM `__hold_pass_requests`;
--> statement-breakpoint
DROP TABLE `__hold_pass_requests`;
--> statement-breakpoint
CREATE INDEX `pass_requests_pass_type_status` ON `pass_requests` (`pass_type_id`,`status`);
--> statement-breakpoint
CREATE INDEX `pass_requests_user` ON `pass_requests` (`user_id`);

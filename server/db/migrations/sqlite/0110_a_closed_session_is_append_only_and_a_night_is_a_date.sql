-- Hand-authored rebuild (F-118 criterion 3, docs/decisions/0063-hand-authored-table-rebuilds.md):
-- each of the three tables gains a CHECK pinning `night` to a London civil date (0014): the GLOB
-- `variant_prices.effective_from` carries, plus `date()`, which refuses a well-shaped impossible
-- day such as 2026-13-45. `till_sessions` also gains the trigger that makes a closed session
-- append-only (0010). All three are mutable tables carrying no trigger
-- today, so nothing of theirs is lost. `sumup_attempts` holds a live restrict foreign key onto
-- `till_sessions`, so it is held, dropped, and recreated under its own name after `till_sessions`
-- exists in its new shape; the ordering follows the fixture 0063 verified, not a fresh argument.
CREATE TABLE `__hold_sumup_attempts` AS SELECT * FROM `sumup_attempts`;
--> statement-breakpoint
DROP TABLE `sumup_attempts`;
--> statement-breakpoint
CREATE TABLE `__new_till_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`night` text NOT NULL,
	`opened_by` text NOT NULL,
	`opened_at` integer DEFAULT (unixepoch()) NOT NULL,
	`closed_by` text,
	`closed_at` integer,
	`expected_total_pence` integer,
	`actual_z_pence` integer,
	`variance_pence` integer,
	`variance_note` text,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`opened_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "till_sessions_night_is_a_date" CHECK("__new_till_sessions"."night" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND "__new_till_sessions"."night" IS date("__new_till_sessions"."night")),
	CONSTRAINT "till_sessions_close_is_whole" CHECK(("__new_till_sessions"."closed_at" IS NULL) = ("__new_till_sessions"."closed_by" IS NULL)),
	CONSTRAINT "till_sessions_closes_after_it_opens" CHECK("__new_till_sessions"."closed_at" IS NULL OR "__new_till_sessions"."closed_at" >= "__new_till_sessions"."opened_at")
);
--> statement-breakpoint
INSERT INTO `__new_till_sessions` (
	`id`, `venue_id`, `night`, `opened_by`, `opened_at`, `closed_by`, `closed_at`,
	`expected_total_pence`, `actual_z_pence`, `variance_pence`, `variance_note`
)
SELECT
	`id`, `venue_id`, `night`, `opened_by`, `opened_at`, `closed_by`, `closed_at`,
	`expected_total_pence`, `actual_z_pence`, `variance_pence`, `variance_note`
FROM `till_sessions`;
--> statement-breakpoint
DROP TABLE `till_sessions`;
--> statement-breakpoint
ALTER TABLE `__new_till_sessions` RENAME TO `till_sessions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `till_sessions_one_open_per_venue_night` ON `till_sessions` (`venue_id`,`night`) WHERE closed_at IS NULL;
--> statement-breakpoint
CREATE INDEX `till_sessions_unclosed` ON `till_sessions` (`night`) WHERE closed_at IS NULL;
--> statement-breakpoint
-- The close itself still runs: its own predicate reads `closed_at IS NULL`, so the trigger fires
-- on every later UPDATE and never on the first (F-118 criterion 3, 0010).
CREATE TRIGGER till_sessions_closed_is_append_only
BEFORE UPDATE ON till_sessions
WHEN OLD.closed_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'a closed till session is append-only: a correction is a new session, not a rewrite');
END;
--> statement-breakpoint
CREATE TABLE `sumup_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`till_session_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`night` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`basket` text NOT NULL,
	`expected_total_pence` integer NOT NULL,
	`status` text DEFAULT 'STARTED' NOT NULL,
	`smp_status` text,
	`smp_tx_code` text,
	`smp_message` text,
	`smp_failure_cause` text,
	`callback_at` integer,
	`resolution` text,
	`resolved_by` text,
	`resolved_at` integer,
	`resolution_note` text,
	`entry_id` text,
	`error` text,
	FOREIGN KEY (`till_session_id`) REFERENCES `till_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "sumup_attempts_night_is_a_date" CHECK("sumup_attempts"."night" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND "sumup_attempts"."night" IS date("sumup_attempts"."night")),
	CONSTRAINT "sumup_attempts_status_values" CHECK("sumup_attempts"."status" IN ('STARTED', 'COMPLETING', 'SUCCEEDED', 'FAILED', 'ABANDONED', 'MISMATCH')),
	CONSTRAINT "sumup_attempts_resolution_values" CHECK("sumup_attempts"."resolution" IS NULL OR "sumup_attempts"."resolution" IN ('CALLBACK', 'KEY', 'STAFF', 'SWEEP')),
	CONSTRAINT "sumup_attempts_entry_needs_success" CHECK("sumup_attempts"."entry_id" IS NULL OR "sumup_attempts"."status" = 'SUCCEEDED')
);
--> statement-breakpoint
INSERT INTO `sumup_attempts` (
	`id`, `till_session_id`, `venue_id`, `night`, `created_by`, `created_at`, `basket`,
	`expected_total_pence`, `status`, `smp_status`, `smp_tx_code`, `smp_message`,
	`smp_failure_cause`, `callback_at`, `resolution`, `resolved_by`, `resolved_at`,
	`resolution_note`, `entry_id`, `error`
)
SELECT
	`id`, `till_session_id`, `venue_id`, `night`, `created_by`, `created_at`, `basket`,
	`expected_total_pence`, `status`, `smp_status`, `smp_tx_code`, `smp_message`,
	`smp_failure_cause`, `callback_at`, `resolution`, `resolved_by`, `resolved_at`,
	`resolution_note`, `entry_id`, `error`
FROM `__hold_sumup_attempts`;
--> statement-breakpoint
DROP TABLE `__hold_sumup_attempts`;
--> statement-breakpoint
CREATE INDEX `sumup_attempts_night_status` ON `sumup_attempts` (`night`,`status`);
--> statement-breakpoint
CREATE INDEX `sumup_attempts_session` ON `sumup_attempts` (`till_session_id`);
--> statement-breakpoint
CREATE TABLE `__new_comp_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`night` text NOT NULL,
	`performance_id` text,
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
	CONSTRAINT "comp_requests_night_is_a_date" CHECK("__new_comp_requests"."night" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND "__new_comp_requests"."night" IS date("__new_comp_requests"."night")),
	CONSTRAINT "comp_requests_status_values" CHECK("__new_comp_requests"."status" IN ('PENDING', 'APPROVED', 'DECLINED')),
	CONSTRAINT "comp_requests_decided_shape" CHECK(
    ("__new_comp_requests"."status" = 'PENDING' AND "__new_comp_requests"."decided_by" IS NULL AND "__new_comp_requests"."decided_at" IS NULL)
    OR ("__new_comp_requests"."status" <> 'PENDING' AND "__new_comp_requests"."decided_by" IS NOT NULL AND "__new_comp_requests"."decided_at" IS NOT NULL)
  ),
	CONSTRAINT "comp_requests_decline_reason_shape" CHECK(("__new_comp_requests"."status" = 'DECLINED') = ("__new_comp_requests"."decline_reason" IS NOT NULL)),
	CONSTRAINT "comp_requests_entry_needs_approval" CHECK("__new_comp_requests"."entry_id" IS NULL OR "__new_comp_requests"."status" = 'APPROVED')
);
--> statement-breakpoint
INSERT INTO `__new_comp_requests` (
	`id`, `venue_id`, `night`, `performance_id`, `requested_by`, `reason`, `lines`, `status`,
	`decided_by`, `decided_at`, `decline_reason`, `entry_id`, `created_at`
)
SELECT
	`id`, `venue_id`, `night`, `performance_id`, `requested_by`, `reason`, `lines`, `status`,
	`decided_by`, `decided_at`, `decline_reason`, `entry_id`, `created_at`
FROM `comp_requests`;
--> statement-breakpoint
DROP TABLE `comp_requests`;
--> statement-breakpoint
ALTER TABLE `__new_comp_requests` RENAME TO `comp_requests`;
--> statement-breakpoint
CREATE INDEX `comp_requests_venue_night` ON `comp_requests` (`venue_id`,`night`);

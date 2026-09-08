CREATE TABLE `age_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text,
	`checked_by` text NOT NULL,
	`outcome` text NOT NULL,
	`id_type` text,
	`reason` text,
	`description` text NOT NULL,
	`product` text,
	`notes` text,
	`supersedes_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`checked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`supersedes_id`) REFERENCES `age_checks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "age_checks_outcome_values" CHECK("age_checks"."outcome" IN ('ACCEPTED', 'REFUSED')),
	CONSTRAINT "age_checks_id_type_values" CHECK("age_checks"."id_type" IS NULL OR "age_checks"."id_type" IN ('PASSPORT', 'DRIVING_LICENCE', 'PASS_CARD', 'OTHER')),
	CONSTRAINT "age_checks_reason_values" CHECK("age_checks"."reason" IS NULL OR "age_checks"."reason" IN ('NO_ID_SHOWN', 'ID_LOOKED_FALSE', 'APPEARED_UNDERAGE', 'OTHER')),
	CONSTRAINT "age_checks_outcome_shape" CHECK(
    ("age_checks"."outcome" = 'ACCEPTED' AND "age_checks"."id_type" IS NOT NULL AND "age_checks"."reason" IS NULL)
    OR ("age_checks"."outcome" = 'REFUSED' AND "age_checks"."reason" IS NOT NULL AND "age_checks"."id_type" IS NULL)
  ),
	CONSTRAINT "age_checks_no_self_supersede" CHECK("age_checks"."supersedes_id" IS NULL OR "age_checks"."supersedes_id" <> "age_checks"."id")
);
--> statement-breakpoint
CREATE INDEX `age_checks_performance` ON `age_checks` (`performance_id`);--> statement-breakpoint
CREATE INDEX `age_checks_checked_by` ON `age_checks` (`checked_by`);--> statement-breakpoint
CREATE INDEX `age_checks_created_at` ON `age_checks` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `age_checks_one_correction` ON `age_checks` (`supersedes_id`);--> statement-breakpoint
-- Append-only is trigger-enforced, not a convention (decision 0010). The licence is defended on
-- paper: a correction is a new entry naming what it supersedes, never an edit to it (E-118 criterion 3).
CREATE TRIGGER age_checks_no_update
BEFORE UPDATE ON age_checks
BEGIN
  SELECT RAISE(ABORT, 'age_checks is append-only: add a correcting entry that supersedes this one');
END;
--> statement-breakpoint
CREATE TRIGGER age_checks_no_delete
BEFORE DELETE ON age_checks
BEGIN
  SELECT RAISE(ABORT, 'age_checks is append-only: add a correcting entry that supersedes this one');
END;
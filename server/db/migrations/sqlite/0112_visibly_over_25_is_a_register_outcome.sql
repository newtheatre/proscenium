-- Hand-authored rebuild (0085, docs/decisions/0063-hand-authored-table-rebuilds.md): `age_checks`
-- gains its third outcome, NOT_REQUIRED (visibly over 25), in both CHECK constraints. This is the
-- one rebuild of an append-only register 0010 allows, because the register holds no production
-- row; every row a development or test database does hold is carried forward. The table's only
-- dependent is itself: `supersedes_id` is a RESTRICT self-reference, and RESTRICT fires row by row
-- inside DROP TABLE's implicit DELETE, so the links are held aside, cut, and restored after the
-- rename. The two append-only triggers are dropped first (an UPDATE has to run) and recreated last.
-- `PRAGMA foreign_keys=OFF` is a no-op inside D1's transaction and is not relied on (0063).
CREATE TABLE `__hold_age_checks` AS SELECT `id`, `supersedes_id` FROM `age_checks`;
--> statement-breakpoint
DROP TRIGGER `age_checks_no_update`;
--> statement-breakpoint
DROP TRIGGER `age_checks_no_delete`;
--> statement-breakpoint
UPDATE `age_checks` SET `supersedes_id` = NULL;
--> statement-breakpoint
CREATE TABLE `__new_age_checks` (
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
	CONSTRAINT "age_checks_outcome_values" CHECK("__new_age_checks"."outcome" IN ('ACCEPTED', 'REFUSED', 'NOT_REQUIRED')),
	CONSTRAINT "age_checks_id_type_values" CHECK("__new_age_checks"."id_type" IS NULL OR "__new_age_checks"."id_type" IN ('PASSPORT', 'DRIVING_LICENCE', 'PASS_CARD', 'OTHER')),
	CONSTRAINT "age_checks_reason_values" CHECK("__new_age_checks"."reason" IS NULL OR "__new_age_checks"."reason" IN ('NO_ID_SHOWN', 'ID_LOOKED_FALSE', 'APPEARED_UNDERAGE', 'OTHER')),
	CONSTRAINT "age_checks_outcome_shape" CHECK(
    ("__new_age_checks"."outcome" = 'ACCEPTED' AND "__new_age_checks"."id_type" IS NOT NULL AND "__new_age_checks"."reason" IS NULL)
    OR ("__new_age_checks"."outcome" = 'REFUSED' AND "__new_age_checks"."reason" IS NOT NULL AND "__new_age_checks"."id_type" IS NULL)
    OR ("__new_age_checks"."outcome" = 'NOT_REQUIRED' AND "__new_age_checks"."id_type" IS NULL AND "__new_age_checks"."reason" IS NULL)
  ),
	CONSTRAINT "age_checks_no_self_supersede" CHECK("__new_age_checks"."supersedes_id" IS NULL OR "__new_age_checks"."supersedes_id" <> "__new_age_checks"."id")
);
--> statement-breakpoint
-- `supersedes_id` is copied as NULL on purpose: a value here would reference the old table, whose
-- drop below would then abort under RESTRICT. The held links go back once the new table has the name.
INSERT INTO `__new_age_checks` (
	`id`, `performance_id`, `checked_by`, `outcome`, `id_type`, `reason`, `description`,
	`product`, `notes`, `supersedes_id`, `created_at`
)
SELECT
	`id`, `performance_id`, `checked_by`, `outcome`, `id_type`, `reason`, `description`,
	`product`, `notes`, NULL, `created_at`
FROM `age_checks`;
--> statement-breakpoint
DROP TABLE `age_checks`;
--> statement-breakpoint
ALTER TABLE `__new_age_checks` RENAME TO `age_checks`;
--> statement-breakpoint
UPDATE `age_checks` SET `supersedes_id` = (SELECT `h`.`supersedes_id` FROM `__hold_age_checks` `h` WHERE `h`.`id` = `age_checks`.`id`);
--> statement-breakpoint
DROP TABLE `__hold_age_checks`;
--> statement-breakpoint
CREATE INDEX `age_checks_performance` ON `age_checks` (`performance_id`);
--> statement-breakpoint
CREATE INDEX `age_checks_checked_by` ON `age_checks` (`checked_by`);
--> statement-breakpoint
CREATE INDEX `age_checks_created_at` ON `age_checks` (`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `age_checks_one_correction` ON `age_checks` (`supersedes_id`);
--> statement-breakpoint
-- Append-only again from here, exactly as 0068 made it (0010, E-118 criterion 3).
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

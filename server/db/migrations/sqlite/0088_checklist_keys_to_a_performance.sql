-- Hand-authored rebuild (E-128, docs/decisions/0063-hand-authored-table-rebuilds.md): neither
-- table carries a trigger, so no trigger re-creation step applies to either.
CREATE TABLE `__new_checklist_stamps` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`item_id` text NOT NULL,
	`phase` text NOT NULL,
	`label` text NOT NULL,
	`sort` integer NOT NULL,
	`required` integer NOT NULL,
	`system_check` text,
	`ticked_by` text,
	`ticked_at` integer,
	`exempted` integer DEFAULT false NOT NULL,
	`exempt_reason` text,
	`exempted_by` text,
	`exempted_at` integer,
	`stamped_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`item_id`) REFERENCES `checklist_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ticked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`exempted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "checklist_stamps_phase_values" CHECK("__new_checklist_stamps"."phase" IN ('PRE', 'POST')),
	CONSTRAINT "checklist_stamps_ticked_shape" CHECK(
    ("__new_checklist_stamps"."ticked_by" IS NULL AND "__new_checklist_stamps"."ticked_at" IS NULL) OR ("__new_checklist_stamps"."ticked_by" IS NOT NULL AND "__new_checklist_stamps"."ticked_at" IS NOT NULL)
  ),
	CONSTRAINT "checklist_stamps_exempt_shape" CHECK(
    ("__new_checklist_stamps"."exempted" = 0 AND "__new_checklist_stamps"."exempt_reason" IS NULL AND "__new_checklist_stamps"."exempted_by" IS NULL AND "__new_checklist_stamps"."exempted_at" IS NULL)
    OR ("__new_checklist_stamps"."exempted" = 1 AND "__new_checklist_stamps"."exempt_reason" IS NOT NULL AND "__new_checklist_stamps"."exempted_by" IS NOT NULL AND "__new_checklist_stamps"."exempted_at" IS NOT NULL)
  ),
	CONSTRAINT "checklist_stamps_not_ticked_and_exempted" CHECK(NOT ("__new_checklist_stamps"."ticked_at" IS NOT NULL AND "__new_checklist_stamps"."exempted" = 1)),
	CONSTRAINT "checklist_stamps_system_never_hand_ticked" CHECK("__new_checklist_stamps"."system_check" IS NULL OR "__new_checklist_stamps"."ticked_by" IS NULL)
);
--> statement-breakpoint
-- Every existing stamp resolves to a performance (0052's named copy). A venue's night has no
-- stored timezone-aware bounds in SQL, so the window is deliberately wide (03:00 to 05:00 the
-- next day, UTC) to cover both GMT and BST without needing one; no show starts in that band.
-- Where more than one performance falls in the window, the earliest by `starts_at` is chosen:
-- the matinee before the evening, the same running order the rest of the estate reads by.
INSERT INTO `__new_checklist_stamps` (
	`id`, `performance_id`, `item_id`, `phase`, `label`, `sort`, `required`, `system_check`,
	`ticked_by`, `ticked_at`, `exempted`, `exempt_reason`, `exempted_by`, `exempted_at`, `stamped_at`
)
SELECT
	cs.id, resolved.performance_id, cs.item_id, cs.phase, cs.label, cs.sort, cs.required, cs.system_check,
	cs.ticked_by, cs.ticked_at, cs.exempted, cs.exempt_reason, cs.exempted_by, cs.exempted_at, cs.stamped_at
FROM `checklist_stamps` cs
JOIN (
	SELECT cs2.id AS stamp_id, (
		SELECT p.id FROM `performances` p
		WHERE p.venue_id = cs2.venue_id
		  AND p.starts_at >= unixepoch(cs2.night || ' 03:00:00')
		  AND p.starts_at <  unixepoch(date(cs2.night, '+1 day') || ' 05:00:00')
		ORDER BY p.starts_at ASC LIMIT 1
	) AS performance_id
	FROM `checklist_stamps` cs2
) resolved ON resolved.stamp_id = cs.id;
--> statement-breakpoint
DROP TABLE `checklist_stamps`;
--> statement-breakpoint
ALTER TABLE `__new_checklist_stamps` RENAME TO `checklist_stamps`;
--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_stamps_performance_item` ON `checklist_stamps` (`performance_id`,`item_id`);
--> statement-breakpoint
CREATE INDEX `checklist_stamps_performance` ON `checklist_stamps` (`performance_id`);
--> statement-breakpoint
CREATE TABLE `__new_checklist_closes` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`closed_by` text NOT NULL,
	`closed_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
-- Same window and tie-break as `checklist_stamps` above: a night closed twice under the old
-- keying could not happen (one row per venue per night), so this copy is always unambiguous
-- except for which single performance the one existing close belongs to.
INSERT INTO `__new_checklist_closes` (
	`id`, `performance_id`, `closed_by`, `closed_at`
)
SELECT
	cc.id, resolved.performance_id, cc.closed_by, cc.closed_at
FROM `checklist_closes` cc
JOIN (
	SELECT cc2.id AS close_id, (
		SELECT p.id FROM `performances` p
		WHERE p.venue_id = cc2.venue_id
		  AND p.starts_at >= unixepoch(cc2.night || ' 03:00:00')
		  AND p.starts_at <  unixepoch(date(cc2.night, '+1 day') || ' 05:00:00')
		ORDER BY p.starts_at ASC LIMIT 1
	) AS performance_id
	FROM `checklist_closes` cc2
) resolved ON resolved.close_id = cc.id;
--> statement-breakpoint
DROP TABLE `checklist_closes`;
--> statement-breakpoint
ALTER TABLE `__new_checklist_closes` RENAME TO `checklist_closes`;
--> statement-breakpoint
CREATE UNIQUE INDEX `checklist_closes_performance` ON `checklist_closes` (`performance_id`);

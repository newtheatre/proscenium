CREATE TABLE `membership_length_options` (
	`id` text PRIMARY KEY,
	`scheme_id` text NOT NULL,
	`name` text NOT NULL,
	`count` integer NOT NULL,
	`state` text DEFAULT 'offered' NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_membership_length_options_scheme_id_membership_schemes_id_fk` FOREIGN KEY (`scheme_id`) REFERENCES `membership_schemes`(`id`),
	CONSTRAINT "membership_length_options_count_range" CHECK("count" BETWEEN 1 AND 120),
	CONSTRAINT "membership_length_options_state" CHECK("state" IN ('offered', 'withdrawn'))
);
--> statement-breakpoint
CREATE TABLE `membership_members` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`number` integer NOT NULL,
	`first_joined_on` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "membership_members_number_positive" CHECK("number" >= 1)
);
--> statement-breakpoint
CREATE TABLE `membership_memberships` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`scheme_id` text NOT NULL,
	`length_option_id` text,
	`realm` text NOT NULL,
	`state` text NOT NULL,
	`origin` text NOT NULL,
	`renews_id` text,
	`response_id` text,
	`starts_on` text,
	`ends_on` text,
	`needs_verification` integer NOT NULL,
	`needs_approval` integer NOT NULL,
	`needs_payment` integer NOT NULL,
	`verified_at` integer,
	`approved_at` integer,
	`paid_at` integer,
	`activated_at` integer,
	`expires_at` integer,
	`ended_at` integer,
	`end_reason` text,
	`added_by` text,
	`ended_by` text,
	`note` text,
	`last_reminder` text,
	`lapse_announced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_membership_memberships_scheme_id_membership_schemes_id_fk` FOREIGN KEY (`scheme_id`) REFERENCES `membership_schemes`(`id`),
	CONSTRAINT `fk_membership_memberships_length_option_id_membership_length_options_id_fk` FOREIGN KEY (`length_option_id`) REFERENCES `membership_length_options`(`id`),
	CONSTRAINT `fk_membership_memberships_renews_id_membership_memberships_id_fk` FOREIGN KEY (`renews_id`) REFERENCES `membership_memberships`(`id`),
	CONSTRAINT "membership_memberships_realm" CHECK("realm" IN ('members', 'audience')),
	CONSTRAINT "membership_memberships_state" CHECK("state" IN ('pending', 'active', 'declined', 'expired', 'ended')),
	CONSTRAINT "membership_memberships_origin" CHECK("origin" IN ('applied', 'added', 'renewed', 'action')),
	CONSTRAINT "membership_memberships_active" CHECK("state" <> 'active' OR ("starts_on" IS NOT NULL AND "activated_at" IS NOT NULL AND ("needs_verification" = 0 OR "verified_at" IS NOT NULL) AND ("needs_approval" = 0 OR "approved_at" IS NOT NULL) AND ("needs_payment" = 0 OR "paid_at" IS NOT NULL))),
	CONSTRAINT "membership_memberships_dates" CHECK("ends_on" IS NULL OR "starts_on" IS NULL OR "ends_on" >= "starts_on"),
	CONSTRAINT "membership_memberships_ended" CHECK(("state" = 'ended') = ("end_reason" IS NOT NULL)),
	CONSTRAINT "membership_memberships_end_reason" CHECK("end_reason" IS NULL OR "end_reason" IN ('by-holder', 'by-staff', 'refunded', 'superseded', 'erased'))
);
--> statement-breakpoint
CREATE TABLE `membership_schemes` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`summary` text,
	`side` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`join_mode` text DEFAULT 'apply' NOT NULL,
	`length_rule` text NOT NULL,
	`fixed_end_month` integer,
	`fixed_end_day` integer,
	`rollover_days` integer DEFAULT 0 NOT NULL,
	`renewal_opens_days` integer NOT NULL,
	`grace_days` integer NOT NULL,
	`verifier` text,
	`verifier_config` text,
	`reverify_on_renewal` integer DEFAULT true NOT NULL,
	`needs_approval` integer DEFAULT false NOT NULL,
	`requires_payment` integer DEFAULT false NOT NULL,
	`voting` integer DEFAULT false NOT NULL,
	`accepts_reference` integer DEFAULT false NOT NULL,
	`holder_may_end` integer NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "membership_schemes_side" CHECK("side" IN ('members', 'audience')),
	CONSTRAINT "membership_schemes_state_values" CHECK("state" IN ('draft', 'open', 'closed', 'archived')),
	CONSTRAINT "membership_schemes_join_mode" CHECK("join_mode" IN ('apply', 'staff-only')),
	CONSTRAINT "membership_schemes_length_rule" CHECK("length_rule" IN ('fixed', 'rolling', 'indefinite')),
	CONSTRAINT "membership_schemes_fixed_end" CHECK(("length_rule" = 'fixed') = ("fixed_end_month" IS NOT NULL AND "fixed_end_day" IS NOT NULL)),
	CONSTRAINT "membership_schemes_fixed_end_valid" CHECK("fixed_end_month" IS NULL OR ("fixed_end_month" BETWEEN 1 AND 12 AND "fixed_end_day" BETWEEN 1 AND (CASE WHEN "fixed_end_month" = 2 THEN 28 WHEN "fixed_end_month" IN (4, 6, 9, 11) THEN 30 ELSE 31 END))),
	CONSTRAINT "membership_schemes_rollover" CHECK("rollover_days" BETWEEN 0 AND 180),
	CONSTRAINT "membership_schemes_renewal_opens" CHECK("renewal_opens_days" BETWEEN 0 AND 180),
	CONSTRAINT "membership_schemes_grace" CHECK("grace_days" BETWEEN 0 AND 90)
);
--> statement-breakpoint
CREATE TABLE `membership_verification_entries` (
	`id` text PRIMARY KEY,
	`list_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`ends_on` text,
	`holder_name` text,
	`used_by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_membership_verification_entries_list_id_membership_verification_lists_id_fk` FOREIGN KEY (`list_id`) REFERENCES `membership_verification_lists`(`id`),
	CONSTRAINT `fk_membership_verification_entries_used_by_membership_memberships_id_fk` FOREIGN KEY (`used_by`) REFERENCES `membership_memberships`(`id`)
);
--> statement-breakpoint
CREATE TABLE `membership_verification_lists` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`key_kind` text NOT NULL,
	`entry_count` integer DEFAULT 0 NOT NULL,
	`valid_until` text,
	`uploaded_by` text NOT NULL,
	`uploaded_at` integer NOT NULL,
	`reference_label` text,
	`reference_shape` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "membership_verification_lists_kind" CHECK("key_kind" IN ('email', 'reference')),
	CONSTRAINT "membership_verification_lists_label" CHECK("key_kind" <> 'reference' OR "reference_label" IS NOT NULL),
	CONSTRAINT "membership_verification_lists_count" CHECK("entry_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `membership_verifications` (
	`id` text PRIMARY KEY,
	`membership_id` text NOT NULL,
	`verifier` text NOT NULL,
	`outcome` text NOT NULL,
	`reason` text,
	`entry_id` text,
	`decided_by` text,
	`note` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_membership_verifications_membership_id_membership_memberships_id_fk` FOREIGN KEY (`membership_id`) REFERENCES `membership_memberships`(`id`),
	CONSTRAINT `fk_membership_verifications_entry_id_membership_verification_entries_id_fk` FOREIGN KEY (`entry_id`) REFERENCES `membership_verification_entries`(`id`),
	CONSTRAINT "membership_verifications_outcome" CHECK("outcome" IN ('passed', 'failed', 'needs-staff'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_length_options_count` ON `membership_length_options` (`scheme_id`,`count`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_members_account` ON `membership_members` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_members_number` ON `membership_members` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_memberships_one_pending` ON `membership_memberships` (`account_id`,`scheme_id`) WHERE state = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `membership_memberships_renewed_once` ON `membership_memberships` (`renews_id`) WHERE state IN ('pending', 'active') AND renews_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `membership_memberships_standing` ON `membership_memberships` (`account_id`,`state`,`starts_on`,`ends_on`);--> statement-breakpoint
CREATE INDEX `membership_memberships_scheme` ON `membership_memberships` (`scheme_id`,`state`,`ends_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_schemes_key` ON `membership_schemes` (`key`);--> statement-breakpoint
CREATE INDEX `membership_schemes_state` ON `membership_schemes` (`state`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_verification_entries_key` ON `membership_verification_entries` (`list_id`,`key_hash`);--> statement-breakpoint
CREATE INDEX `membership_verifications_membership` ON `membership_verifications` (`membership_id`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `membership_verifications_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `membership_verifications_append_only_delete` BEFORE DELETE ON `membership_verifications` BEGIN SELECT RAISE(ABORT, 'append-only: membership_verifications'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `membership_verifications_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `membership_verifications_append_only_update` BEFORE UPDATE ON `membership_verifications` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`membership_id` IS OLD.`membership_id` AND NEW.`verifier` IS OLD.`verifier` AND NEW.`outcome` IS OLD.`outcome` AND NEW.`reason` IS OLD.`reason` AND NEW.`entry_id` IS OLD.`entry_id` AND NEW.`decided_by` IS OLD.`decided_by` AND (NEW.`note` IS OLD.`note` OR NEW.`note` IS '[removed]') AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: membership_verifications'); END;

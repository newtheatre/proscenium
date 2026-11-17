CREATE TABLE `awards_awards` (
	`id` text PRIMARY KEY,
	`type_id` text NOT NULL,
	`account_id` text,
	`recipient_name` text NOT NULL,
	`awarded_on` text NOT NULL,
	`awarded_for` text,
	`citation` text,
	`production_id` text,
	`decided_on` text,
	`decision_note` text,
	`source` text NOT NULL,
	`response_id` text,
	`visibility` text NOT NULL,
	`state` text DEFAULT 'current' NOT NULL,
	`issued_by` text,
	`revoked_at` integer,
	`revoked_by` text,
	`revoke_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_awards_awards_type_id_awards_types_id_fk` FOREIGN KEY (`type_id`) REFERENCES `awards_types`(`id`),
	CONSTRAINT `fk_awards_awards_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`),
	CONSTRAINT "awards_awards_state" CHECK("state" IN ('current', 'revoked')),
	CONSTRAINT "awards_awards_source" CHECK("source" IN ('direct', 'nomination', 'import')),
	CONSTRAINT "awards_awards_visibility" CHECK("visibility" IN ('public', 'members', 'hidden')),
	CONSTRAINT "awards_awards_name" CHECK(length("recipient_name") BETWEEN 1 AND 120),
	CONSTRAINT "awards_awards_revoked" CHECK(("state" = 'revoked') = ("revoked_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `awards_types` (
	`id` text PRIMARY KEY,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`summary` text,
	`gives_ticket_benefit` integer DEFAULT false NOT NULL,
	`one_per_person` integer DEFAULT true NOT NULL,
	`default_visibility` text DEFAULT 'public' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "awards_types_state_values" CHECK("state" IN ('active', 'archived')),
	CONSTRAINT "awards_types_visibility" CHECK("default_visibility" IN ('public', 'members', 'hidden')),
	CONSTRAINT "awards_types_name" CHECK(length("name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE INDEX `awards_awards_type` ON `awards_awards` (`type_id`,`state`,`awarded_on`);--> statement-breakpoint
CREATE INDEX `awards_awards_account` ON `awards_awards` (`account_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `awards_types_key` ON `awards_types` (`key`);--> statement-breakpoint
CREATE INDEX `awards_types_state` ON `awards_types` (`state`,`position`);
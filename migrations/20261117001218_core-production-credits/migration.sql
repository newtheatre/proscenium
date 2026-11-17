CREATE TABLE `core_production_credits` (
	`id` text PRIMARY KEY,
	`production_id` text NOT NULL,
	`account_id` text,
	`credited_name` text NOT NULL,
	`role` text NOT NULL,
	`section_term_id` text NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_core_production_credits_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_production_credits_section_term_id_core_terms_id_fk` FOREIGN KEY (`section_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "core_production_credits_visibility" CHECK("visibility" IN ('public', 'members', 'hidden')),
	CONSTRAINT "core_production_credits_name" CHECK(length("credited_name") BETWEEN 1 AND 120),
	CONSTRAINT "core_production_credits_role" CHECK(length("role") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE INDEX `core_production_credits_order` ON `core_production_credits` (`production_id`,`section_term_id`,`sort`);--> statement-breakpoint
CREATE INDEX `core_production_credits_account` ON `core_production_credits` (`account_id`);
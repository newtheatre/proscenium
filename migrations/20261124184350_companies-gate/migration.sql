CREATE TABLE `companies_agreement_responses` (
	`id` text PRIMARY KEY,
	`agreement_id` text NOT NULL,
	`answer` text NOT NULL,
	`responder_id` text NOT NULL,
	`on_behalf_of` text,
	`recorded_by` text,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_companies_agreement_responses_agreement_id_companies_agreements_id_fk` FOREIGN KEY (`agreement_id`) REFERENCES `companies_agreements`(`id`),
	CONSTRAINT "companies_agreement_responses_answer" CHECK("answer" IN ('accepted', 'declined'))
);
--> statement-breakpoint
CREATE TABLE `companies_agreements` (
	`id` text PRIMARY KEY,
	`engagement_id` text NOT NULL,
	`version` integer NOT NULL,
	`supersedes_id` text,
	`deal_type` text NOT NULL,
	`company_share_bp` integer,
	`share_basis` text,
	`guarantee_minor` integer,
	`hire_fee_minor` integer,
	`hire_fee_basis` text,
	`deposit_minor` integer DEFAULT 0 NOT NULL,
	`guest_places` integer DEFAULT 0 NOT NULL,
	`guest_names_due` text NOT NULL,
	`settle_within` text NOT NULL,
	`clauses` text,
	`file_id` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`sent_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_companies_agreements_engagement_id_companies_engagements_id_fk` FOREIGN KEY (`engagement_id`) REFERENCES `companies_engagements`(`id`),
	CONSTRAINT "companies_agreements_deal_type" CHECK("deal_type" IN ('split', 'guarantee', 'guarantee-or-split', 'hire', 'none')),
	CONSTRAINT "companies_agreements_state" CHECK("state" IN ('draft', 'sent', 'accepted', 'declined', 'superseded', 'withdrawn')),
	CONSTRAINT "companies_agreements_version_from_one" CHECK("version" >= 1),
	CONSTRAINT "companies_agreements_share" CHECK("company_share_bp" IS NULL OR "company_share_bp" BETWEEN 0 AND 10000),
	CONSTRAINT "companies_agreements_money" CHECK(coalesce("guarantee_minor", 0) >= 0 AND coalesce("hire_fee_minor", 0) >= 0 AND "deposit_minor" >= 0),
	CONSTRAINT "companies_agreements_places" CHECK("guest_places" BETWEEN 0 AND 50),
	CONSTRAINT "companies_agreements_clauses" CHECK("clauses" IS NULL OR length("clauses") <= 20000)
);
--> statement-breakpoint
CREATE TABLE `companies_allocations` (
	`id` text PRIMARY KEY,
	`engagement_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`places` integer NOT NULL,
	`named` integer DEFAULT 0 NOT NULL,
	`hold_ref` text,
	`names_due_at` integer NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_companies_allocations_engagement_id_companies_engagements_id_fk` FOREIGN KEY (`engagement_id`) REFERENCES `companies_engagements`(`id`),
	CONSTRAINT "companies_allocations_state" CHECK("state" IN ('open', 'closed', 'released')),
	CONSTRAINT "companies_allocations_places" CHECK("places" BETWEEN 0 AND 50 AND "named" BETWEEN 0 AND "places")
);
--> statement-breakpoint
CREATE TABLE `companies_calls` (
	`id` text PRIMARY KEY,
	`engagement_id` text NOT NULL,
	`kind` text NOT NULL,
	`space_id` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`label` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_companies_calls_engagement_id_companies_engagements_id_fk` FOREIGN KEY (`engagement_id`) REFERENCES `companies_engagements`(`id`),
	CONSTRAINT "companies_calls_kind" CHECK("kind" IN ('get-in', 'technical', 'dress', 'get-out', 'other')),
	CONSTRAINT "companies_calls_times" CHECK("ends_at" > "starts_at"),
	CONSTRAINT "companies_calls_label" CHECK(("kind" <> 'other' OR "label" IS NOT NULL) AND ("label" IS NULL OR length("label") <= 80)),
	CONSTRAINT "companies_calls_notes" CHECK("notes" IS NULL OR length("notes") <= 1000)
);
--> statement-breakpoint
CREATE TABLE `companies_companies` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`public_name` text,
	`legal_name` text,
	`registration` text,
	`tax_number` text,
	`address` text,
	`postcode` text,
	`country` text,
	`invoice_email` text,
	`website` text,
	`description` text,
	`individual` integer DEFAULT false NOT NULL,
	`individual_account_id` text,
	`data_class` text DEFAULT 'public' NOT NULL,
	`notes` text,
	`archived_at` integer,
	`merged_into_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "companies_companies_name_length" CHECK(length("name") BETWEEN 1 AND 160),
	CONSTRAINT "companies_companies_public_name" CHECK("public_name" IS NULL OR length("public_name") <= 160),
	CONSTRAINT "companies_companies_legal_name" CHECK("legal_name" IS NULL OR length("legal_name") <= 200),
	CONSTRAINT "companies_companies_registration" CHECK("registration" IS NULL OR length("registration") <= 60),
	CONSTRAINT "companies_companies_tax_number" CHECK("tax_number" IS NULL OR length("tax_number") <= 30),
	CONSTRAINT "companies_companies_address" CHECK("address" IS NULL OR length("address") <= 400),
	CONSTRAINT "companies_companies_postcode" CHECK("postcode" IS NULL OR length("postcode") <= 12),
	CONSTRAINT "companies_companies_description" CHECK("description" IS NULL OR length("description") <= 600),
	CONSTRAINT "companies_companies_notes" CHECK("notes" IS NULL OR length("notes") <= 4000),
	CONSTRAINT "companies_companies_website" CHECK("website" IS NULL OR ("website" LIKE 'https://%' AND length("website") <= 300)),
	CONSTRAINT "companies_companies_individual" CHECK(("individual" = 0 AND "data_class" = 'public') OR ("individual" = 1 AND "data_class" = 'personal' AND "individual_account_id" IS NOT NULL)),
	CONSTRAINT "companies_companies_merged" CHECK("merged_into_id" IS NULL OR "archived_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `companies_contacts` (
	`id` text PRIMARY KEY,
	`company_id` text NOT NULL,
	`account_id` text NOT NULL,
	`role` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`receives` text DEFAULT '[]' NOT NULL,
	`day_phone` text,
	`ended_at` integer,
	`added_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_companies_contacts_company_id_companies_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies_companies`(`id`),
	CONSTRAINT "companies_contacts_role" CHECK("role" IS NULL OR length("role") <= 80),
	CONSTRAINT "companies_contacts_phone" CHECK("day_phone" IS NULL OR length("day_phone") <= 30)
);
--> statement-breakpoint
CREATE TABLE `companies_engagement_events` (
	`id` text PRIMARY KEY,
	`engagement_id` text NOT NULL,
	`kind` text NOT NULL,
	`from_state` text,
	`to_state` text,
	`detail` text,
	`actor_id` text,
	`at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_companies_engagement_events_engagement_id_companies_engagements_id_fk` FOREIGN KEY (`engagement_id`) REFERENCES `companies_engagements`(`id`),
	CONSTRAINT "companies_engagement_events_kind" CHECK("kind" IN ('opened', 'moved', 'cancelled', 'linked', 'agreement-sent', 'agreement-answered', 'agreement-withdrawn', 'agreement-superseded', 'call-changed', 'people-changed', 'allocation-made', 'allocation-changed', 'allocation-closed', 'allocation-released', 'guest-named', 'guest-withdrawn', 'deposit-changed', 'settlement-drafted', 'settlement-proposed', 'settlement-answered', 'settlement-approved', 'settlement-paid'))
);
--> statement-breakpoint
CREATE TABLE `companies_engagements` (
	`id` text PRIMARY KEY,
	`company_id` text NOT NULL,
	`kind` text NOT NULL,
	`production_id` text,
	`season_id` text,
	`title` text NOT NULL,
	`state` text DEFAULT 'enquiry' NOT NULL,
	`venue_contact_id` text,
	`tech_notes` text,
	`arrival_notes` text,
	`rider_file_ids` text DEFAULT '[]' NOT NULL,
	`deposit_minor` integer DEFAULT 0 NOT NULL,
	`deposit_state` text DEFAULT 'none' NOT NULL,
	`deposit_intent_id` text,
	`currency` text NOT NULL,
	`source_ref` text,
	`cancel_reason` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_companies_engagements_company_id_companies_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies_companies`(`id`),
	CONSTRAINT "companies_engagements_kind" CHECK("kind" IN ('visiting', 'act', 'hire')),
	CONSTRAINT "companies_engagements_state" CHECK("state" IN ('enquiry', 'offered', 'agreed', 'confirmed', 'completed', 'settled', 'cancelled')),
	CONSTRAINT "companies_engagements_deposit_state" CHECK("deposit_state" IN ('none', 'due', 'held', 'returned', 'kept', 'part-kept')),
	CONSTRAINT "companies_engagements_title" CHECK(length("title") BETWEEN 1 AND 160),
	CONSTRAINT "companies_engagements_tech_notes" CHECK("tech_notes" IS NULL OR length("tech_notes") <= 8000),
	CONSTRAINT "companies_engagements_arrival_notes" CHECK("arrival_notes" IS NULL OR length("arrival_notes") <= 2000),
	CONSTRAINT "companies_engagements_deposit" CHECK("deposit_minor" >= 0),
	CONSTRAINT "companies_engagements_cancelled" CHECK(("state" = 'cancelled') = ("cancel_reason" IS NOT NULL)),
	CONSTRAINT "companies_engagements_cancel_reason" CHECK("cancel_reason" IS NULL OR length("cancel_reason") <= 500)
);
--> statement-breakpoint
CREATE TABLE `companies_guests` (
	`id` text PRIMARY KEY,
	`allocation_id` text NOT NULL,
	`account_id` text NOT NULL,
	`places` integer DEFAULT 1 NOT NULL,
	`order_ref` text,
	`state` text DEFAULT 'named' NOT NULL,
	`named_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_companies_guests_allocation_id_companies_allocations_id_fk` FOREIGN KEY (`allocation_id`) REFERENCES `companies_allocations`(`id`),
	CONSTRAINT "companies_guests_state" CHECK("state" IN ('named', 'issued', 'withdrawn')),
	CONSTRAINT "companies_guests_places" CHECK("places" BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE `companies_people` (
	`id` text PRIMARY KEY,
	`engagement_id` text NOT NULL,
	`account_id` text,
	`name` text NOT NULL,
	`role` text,
	`under_18` integer DEFAULT false,
	`added_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_companies_people_engagement_id_companies_engagements_id_fk` FOREIGN KEY (`engagement_id`) REFERENCES `companies_engagements`(`id`),
	CONSTRAINT "companies_people_name" CHECK(length("name") BETWEEN 1 AND 120),
	CONSTRAINT "companies_people_role" CHECK("role" IS NULL OR length("role") <= 80)
);
--> statement-breakpoint
CREATE TABLE `companies_settlement_lines` (
	`id` text PRIMARY KEY,
	`settlement_id` text NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`source_ref` text,
	`posts` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_companies_settlement_lines_settlement_id_companies_settlements_id_fk` FOREIGN KEY (`settlement_id`) REFERENCES `companies_settlements`(`id`),
	CONSTRAINT "companies_settlement_lines_kind" CHECK("kind" IN ('company-share', 'guarantee-top-up', 'hire-fee', 'charge', 'deposit-kept', 'adjustment', 'note')),
	CONSTRAINT "companies_settlement_lines_label" CHECK(length("label") BETWEEN 1 AND 120),
	CONSTRAINT "companies_settlement_lines_note" CHECK(("kind" = 'note') = ("amount_minor" = 0) AND ("kind" <> 'note' OR "posts" = 0))
);
--> statement-breakpoint
CREATE TABLE `companies_settlement_payments` (
	`id` text PRIMARY KEY,
	`settlement_id` text NOT NULL,
	`direction` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`intent_id` text,
	`posting_id` text,
	`recorded_by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_companies_settlement_payments_settlement_id_companies_settlements_id_fk` FOREIGN KEY (`settlement_id`) REFERENCES `companies_settlements`(`id`),
	CONSTRAINT "companies_settlement_payments_direction" CHECK("direction" IN ('out', 'in')),
	CONSTRAINT "companies_settlement_payments_method" CHECK("method" IN ('bank-transfer', 'cheque', 'payments')),
	CONSTRAINT "companies_settlement_payments_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "companies_settlement_payments_reference" CHECK("reference" IS NULL OR length("reference") <= 80)
);
--> statement-breakpoint
CREATE TABLE `companies_settlements` (
	`id` text PRIMARY KEY,
	`engagement_id` text NOT NULL,
	`version` integer NOT NULL,
	`supersedes_id` text,
	`agreement_id` text,
	`statement_as_of` integer NOT NULL,
	`gross_minor` integer DEFAULT 0 NOT NULL,
	`fees_minor` integer DEFAULT 0 NOT NULL,
	`refunds_minor` integer DEFAULT 0 NOT NULL,
	`basis_minor` integer DEFAULT 0 NOT NULL,
	`balance_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`proposed_at` integer,
	`query_note` text,
	`queried_by` text,
	`prepared_by` text,
	`approved_by` text,
	`agreed_by` text,
	`posting_id` text,
	`invoice_ref` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_companies_settlements_engagement_id_companies_engagements_id_fk` FOREIGN KEY (`engagement_id`) REFERENCES `companies_engagements`(`id`),
	CONSTRAINT `fk_companies_settlements_agreement_id_companies_agreements_id_fk` FOREIGN KEY (`agreement_id`) REFERENCES `companies_agreements`(`id`),
	CONSTRAINT "companies_settlements_state" CHECK("state" IN ('draft', 'proposed', 'agreed', 'queried', 'approved', 'paid', 'superseded', 'void')),
	CONSTRAINT "companies_settlements_two_people" CHECK("approved_by" IS NULL OR "approved_by" IS NOT "prepared_by"),
	CONSTRAINT "companies_settlements_query" CHECK("query_note" IS NULL OR length("query_note") <= 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_agreement_responses_once` ON `companies_agreement_responses` (`agreement_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `companies_agreements_version` ON `companies_agreements` (`engagement_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `companies_allocations_performance` ON `companies_allocations` (`engagement_id`,`performance_id`);--> statement-breakpoint
CREATE INDEX `companies_calls_engagement` ON `companies_calls` (`engagement_id`,`starts_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `companies_companies_name` ON `companies_companies` (lower("name")) WHERE archived_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `companies_contacts_live` ON `companies_contacts` (`company_id`,`account_id`) WHERE ended_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `companies_contacts_primary` ON `companies_contacts` (`company_id`) WHERE ended_at IS NULL AND is_primary = 1;--> statement-breakpoint
CREATE INDEX `companies_contacts_account` ON `companies_contacts` (`account_id`);--> statement-breakpoint
CREATE INDEX `companies_engagement_events_engagement` ON `companies_engagement_events` (`engagement_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `companies_engagements_production` ON `companies_engagements` (`production_id`) WHERE production_id IS NOT NULL AND state <> 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX `companies_engagements_source` ON `companies_engagements` (`source_ref`) WHERE source_ref IS NOT NULL;--> statement-breakpoint
CREATE INDEX `companies_engagements_company` ON `companies_engagements` (`company_id`,`state`);--> statement-breakpoint
CREATE INDEX `companies_engagements_season` ON `companies_engagements` (`season_id`);--> statement-breakpoint
CREATE INDEX `companies_guests_allocation` ON `companies_guests` (`allocation_id`,`state`);--> statement-breakpoint
CREATE INDEX `companies_guests_account` ON `companies_guests` (`account_id`);--> statement-breakpoint
CREATE INDEX `companies_people_engagement` ON `companies_people` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `companies_settlement_lines_settlement` ON `companies_settlement_lines` (`settlement_id`,`sort`);--> statement-breakpoint
CREATE INDEX `companies_settlement_payments_settlement` ON `companies_settlement_payments` (`settlement_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `companies_settlements_version` ON `companies_settlements` (`engagement_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `companies_settlements_current` ON `companies_settlements` (`engagement_id`) WHERE state NOT IN ('superseded', 'void');
--> statement-breakpoint
DROP TRIGGER IF EXISTS `companies_engagement_events_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `companies_engagement_events_append_only_delete` BEFORE DELETE ON `companies_engagement_events` BEGIN SELECT RAISE(ABORT, 'append-only: companies_engagement_events'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `companies_engagement_events_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `companies_engagement_events_append_only_update` BEFORE UPDATE ON `companies_engagement_events` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`engagement_id` IS OLD.`engagement_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`from_state` IS OLD.`from_state` AND NEW.`to_state` IS OLD.`to_state` AND NEW.`detail` IS OLD.`detail` AND NEW.`actor_id` IS OLD.`actor_id` AND NEW.`at` IS OLD.`at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: companies_engagement_events'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `companies_agreements_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `companies_agreements_append_only_delete` BEFORE DELETE ON `companies_agreements` BEGIN SELECT RAISE(ABORT, 'append-only: companies_agreements'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `companies_agreements_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `companies_agreements_append_only_update` BEFORE UPDATE ON `companies_agreements` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`engagement_id` IS OLD.`engagement_id` AND NEW.`version` IS OLD.`version` AND NEW.`supersedes_id` IS OLD.`supersedes_id` AND NEW.`deal_type` IS OLD.`deal_type` AND NEW.`company_share_bp` IS OLD.`company_share_bp` AND NEW.`share_basis` IS OLD.`share_basis` AND NEW.`guarantee_minor` IS OLD.`guarantee_minor` AND NEW.`hire_fee_minor` IS OLD.`hire_fee_minor` AND NEW.`hire_fee_basis` IS OLD.`hire_fee_basis` AND NEW.`deposit_minor` IS OLD.`deposit_minor` AND NEW.`guest_places` IS OLD.`guest_places` AND NEW.`guest_names_due` IS OLD.`guest_names_due` AND NEW.`settle_within` IS OLD.`settle_within` AND NEW.`clauses` IS OLD.`clauses` AND NEW.`file_id` IS OLD.`file_id` AND NEW.`created_by` IS OLD.`created_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: companies_agreements'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `companies_agreement_responses_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `companies_agreement_responses_append_only_delete` BEFORE DELETE ON `companies_agreement_responses` BEGIN SELECT RAISE(ABORT, 'append-only: companies_agreement_responses'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `companies_agreement_responses_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `companies_agreement_responses_append_only_update` BEFORE UPDATE ON `companies_agreement_responses` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`agreement_id` IS OLD.`agreement_id` AND NEW.`answer` IS OLD.`answer` AND NEW.`responder_id` IS OLD.`responder_id` AND NEW.`on_behalf_of` IS OLD.`on_behalf_of` AND NEW.`recorded_by` IS OLD.`recorded_by` AND NEW.`at` IS OLD.`at` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: companies_agreement_responses'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `companies_settlement_payments_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `companies_settlement_payments_append_only_delete` BEFORE DELETE ON `companies_settlement_payments` BEGIN SELECT RAISE(ABORT, 'append-only: companies_settlement_payments'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `companies_settlement_payments_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `companies_settlement_payments_append_only_update` BEFORE UPDATE ON `companies_settlement_payments` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`settlement_id` IS OLD.`settlement_id` AND NEW.`direction` IS OLD.`direction` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`method` IS OLD.`method` AND NEW.`reference` IS OLD.`reference` AND NEW.`intent_id` IS OLD.`intent_id` AND NEW.`posting_id` IS OLD.`posting_id` AND NEW.`recorded_by` IS OLD.`recorded_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: companies_settlement_payments'); END;

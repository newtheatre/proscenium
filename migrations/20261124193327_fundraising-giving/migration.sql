CREATE TABLE `fundraising_donations` (
	`id` text PRIMARY KEY,
	`reference` text,
	`account_id` text,
	`contact_email` text,
	`donor_name` text,
	`company_id` text,
	`organisation_name` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`fund_id` text NOT NULL,
	`campaign_id` text,
	`production_id` text,
	`channel` text NOT NULL,
	`how_received` text,
	`received_on` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`refunded_minor` integer DEFAULT 0 NOT NULL,
	`intent_id` text,
	`part_id` text,
	`rode_with` text,
	`acknowledge_as` text,
	`show_amount` integer DEFAULT false,
	`sds_status` text DEFAULT 'none' NOT NULL,
	`message` text,
	`has_benefit` integer DEFAULT false NOT NULL,
	`gift_aid` text DEFAULT 'none' NOT NULL,
	`gift_aid_reason` text,
	`declaration_id` text,
	`link_hash` text,
	`recorded_by` text,
	`posting_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_fundraising_donations_fund_id_fundraising_funds_id_fk` FOREIGN KEY (`fund_id`) REFERENCES `fundraising_funds`(`id`),
	CONSTRAINT `fk_fundraising_donations_intent_id_payments_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `payments_intents`(`id`),
	CONSTRAINT "fundraising_donations_amount" CHECK("amount_minor" > 0),
	CONSTRAINT "fundraising_donations_refunded" CHECK("refunded_minor" >= 0 AND "refunded_minor" <= "amount_minor"),
	CONSTRAINT "fundraising_donations_channel" CHECK("channel" IN ('online', 'checkout', 'till', 'recorded', 'collection', 'regular')),
	CONSTRAINT "fundraising_donations_how" CHECK("how_received" IS NULL OR "how_received" IN ('card', 'cash', 'cheque', 'bank-transfer', 'elsewhere')),
	CONSTRAINT "fundraising_donations_recorded" CHECK("channel" <> 'recorded' OR "how_received" IS NOT NULL),
	CONSTRAINT "fundraising_donations_state" CHECK("state" IN ('pending', 'received', 'abandoned', 'refunded')),
	CONSTRAINT "fundraising_donations_received" CHECK("state" NOT IN ('received', 'refunded') OR ("received_on" IS NOT NULL AND "reference" IS NOT NULL)),
	CONSTRAINT "fundraising_donations_gift_aid" CHECK("gift_aid" IN ('none', 'eligible', 'claimed', 'adjusted', 'ineligible')),
	CONSTRAINT "fundraising_donations_sds" CHECK("sds_status" IN ('none', 'eligible', 'claimed', 'excluded')),
	CONSTRAINT "fundraising_donations_acknowledge" CHECK("acknowledge_as" IS NULL OR length("acknowledge_as") <= 60),
	CONSTRAINT "fundraising_donations_message" CHECK("message" IS NULL OR length("message") <= 500)
);
--> statement-breakpoint
CREATE TABLE `fundraising_funds` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`purpose` text,
	`restricted` integer DEFAULT false NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`offered` integer DEFAULT true NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`sort` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "fundraising_funds_state" CHECK("state" IN ('active', 'archived')),
	CONSTRAINT "fundraising_funds_name_length" CHECK(length("name") BETWEEN 1 AND 80),
	CONSTRAINT "fundraising_funds_purpose" CHECK("restricted" = 0 OR length(coalesce("purpose", '')) > 0),
	CONSTRAINT "fundraising_funds_default_active" CHECK("is_default" = 0 OR "state" = 'active')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fundraising_donations_reference` ON `fundraising_donations` (`reference`) WHERE reference IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `fundraising_donations_part` ON `fundraising_donations` (`part_id`) WHERE part_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `fundraising_donations_link` ON `fundraising_donations` (`link_hash`) WHERE link_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX `fundraising_donations_account` ON `fundraising_donations` (`account_id`,`received_on`);--> statement-breakpoint
CREATE INDEX `fundraising_donations_email` ON `fundraising_donations` (`contact_email`);--> statement-breakpoint
CREATE INDEX `fundraising_donations_campaign` ON `fundraising_donations` (`campaign_id`,`state`);--> statement-breakpoint
CREATE INDEX `fundraising_donations_fund` ON `fundraising_donations` (`fund_id`,`received_on`);--> statement-breakpoint
CREATE INDEX `fundraising_donations_intent` ON `fundraising_donations` (`intent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `fundraising_funds_one_default` ON `fundraising_funds` (`is_default`) WHERE is_default = 1 AND state = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `fundraising_funds_name` ON `fundraising_funds` (lower(name)) WHERE state = 'active';
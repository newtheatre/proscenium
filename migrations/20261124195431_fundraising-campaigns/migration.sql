CREATE TABLE `fundraising_campaigns` (
	`id` text PRIMARY KEY,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`body` text,
	`fund_id` text NOT NULL,
	`production_id` text,
	`target_minor` integer,
	`currency` text NOT NULL,
	`offset_minor` integer DEFAULT 0 NOT NULL,
	`offset_note` text,
	`opens_at` integer NOT NULL,
	`closes_at` integer,
	`published_at` integer,
	`state` text DEFAULT 'draft' NOT NULL,
	`show_total` integer NOT NULL,
	`count_gift_aid` integer NOT NULL,
	`list_names` integer DEFAULT false NOT NULL,
	`list_amounts` text DEFAULT 'none' NOT NULL,
	`target_reached_at` integer,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_fundraising_campaigns_fund_id_fundraising_funds_id_fk` FOREIGN KEY (`fund_id`) REFERENCES `fundraising_funds`(`id`),
	CONSTRAINT "fundraising_campaigns_state" CHECK("state" IN ('draft', 'open', 'closed', 'archived')),
	CONSTRAINT "fundraising_campaigns_list_amounts" CHECK("list_amounts" IN ('none', 'band', 'exact')),
	CONSTRAINT "fundraising_campaigns_slug_shape" CHECK("slug" GLOB '[a-z0-9]*' AND "slug" NOT GLOB '*[^a-z0-9-]*' AND "slug" NOT LIKE '%-' AND length("slug") <= 80),
	CONSTRAINT "fundraising_campaigns_title" CHECK(length("title") BETWEEN 1 AND 120),
	CONSTRAINT "fundraising_campaigns_summary" CHECK(length("summary") BETWEEN 1 AND 200),
	CONSTRAINT "fundraising_campaigns_target" CHECK("target_minor" IS NULL OR "target_minor" > 0),
	CONSTRAINT "fundraising_campaigns_offset" CHECK("offset_minor" >= 0 AND ("offset_minor" = 0 OR length(coalesce("offset_note", '')) > 0)),
	CONSTRAINT "fundraising_campaigns_closes" CHECK("closes_at" IS NULL OR "closes_at" > "opens_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fundraising_campaigns_slug` ON `fundraising_campaigns` (`slug`);--> statement-breakpoint
CREATE INDEX `fundraising_campaigns_state` ON `fundraising_campaigns` (`state`,`opens_at`);--> statement-breakpoint
CREATE INDEX `fundraising_campaigns_production` ON `fundraising_campaigns` (`production_id`);
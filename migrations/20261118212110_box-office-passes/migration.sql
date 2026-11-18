CREATE TABLE `box_office_pass_prices` (
	`id` text PRIMARY KEY,
	`pass_type_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`requirement_refs` text,
	`proof_note` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_pass_prices_pass_type_id_box_office_pass_types_id_fk` FOREIGN KEY (`pass_type_id`) REFERENCES `box_office_pass_types`(`id`),
	CONSTRAINT "box_office_pass_prices_name_length" CHECK(length("name") BETWEEN 1 AND 60),
	CONSTRAINT "box_office_pass_prices_amount" CHECK("amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `box_office_pass_redemptions` (
	`id` text PRIMARY KEY,
	`pass_id` text NOT NULL,
	`production_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`order_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`once` integer DEFAULT true NOT NULL,
	`state` text DEFAULT 'live' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_pass_redemptions_pass_id_box_office_passes_id_fk` FOREIGN KEY (`pass_id`) REFERENCES `box_office_passes`(`id`),
	CONSTRAINT "box_office_pass_redemptions_state" CHECK("state" IN ('live', 'released'))
);
--> statement-breakpoint
CREATE TABLE `box_office_pass_shows` (
	`id` text PRIMARY KEY,
	`pass_type_id` text NOT NULL,
	`production_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_pass_shows_pass_type_id_box_office_pass_types_id_fk` FOREIGN KEY (`pass_type_id`) REFERENCES `box_office_pass_types`(`id`)
);
--> statement-breakpoint
CREATE TABLE `box_office_pass_types` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`covers` text DEFAULT 'productions' NOT NULL,
	`season_id` text,
	`covers_from` integer,
	`covers_until` integer,
	`per_show` text DEFAULT 'once' NOT NULL,
	`uses` integer,
	`holder` text DEFAULT 'auto' NOT NULL,
	`reserve_unpaid` integer DEFAULT true NOT NULL,
	`recheck` integer DEFAULT false NOT NULL,
	`channel` text DEFAULT 'all' NOT NULL,
	`on_sale` integer DEFAULT false NOT NULL,
	`sale_from` integer,
	`sale_until` integer,
	`active` integer DEFAULT true NOT NULL,
	`currency` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "box_office_pass_types_name_length" CHECK(length("name") BETWEEN 1 AND 80),
	CONSTRAINT "box_office_pass_types_covers" CHECK("covers" IN ('productions', 'season', 'dates') AND ("covers" <> 'season' OR "season_id" IS NOT NULL) AND ("covers" <> 'dates' OR ("covers_from" IS NOT NULL AND "covers_until" IS NOT NULL AND "covers_until" > "covers_from"))),
	CONSTRAINT "box_office_pass_types_per_show" CHECK("per_show" IN ('once', 'any')),
	CONSTRAINT "box_office_pass_types_uses" CHECK("uses" IS NULL OR "uses" > 0),
	CONSTRAINT "box_office_pass_types_holder" CHECK("holder" IN ('auto', 'named', 'open')),
	CONSTRAINT "box_office_pass_types_channel" CHECK("channel" IN ('all', 'desk', 'online'))
);
--> statement-breakpoint
CREATE TABLE `box_office_passes` (
	`id` text PRIMARY KEY,
	`pass_type_id` text NOT NULL,
	`pass_price_id` text NOT NULL,
	`order_line_id` text,
	`account_id` text,
	`named` integer DEFAULT false NOT NULL,
	`code_hash` text NOT NULL,
	`code` text,
	`uses_total` integer,
	`uses_taken` integer DEFAULT 0 NOT NULL,
	`once` integer DEFAULT true NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`issued_at` integer,
	`paid_at` integer,
	`state` text DEFAULT 'active' NOT NULL,
	`issued_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_passes_pass_type_id_box_office_pass_types_id_fk` FOREIGN KEY (`pass_type_id`) REFERENCES `box_office_pass_types`(`id`),
	CONSTRAINT `fk_box_office_passes_pass_price_id_box_office_pass_prices_id_fk` FOREIGN KEY (`pass_price_id`) REFERENCES `box_office_pass_prices`(`id`),
	CONSTRAINT `fk_box_office_passes_order_line_id_box_office_order_lines_id_fk` FOREIGN KEY (`order_line_id`) REFERENCES `box_office_order_lines`(`id`),
	CONSTRAINT "box_office_passes_state" CHECK("state" IN ('active', 'void')),
	CONSTRAINT "box_office_passes_amount" CHECK("amount_minor" >= 0),
	CONSTRAINT "box_office_passes_uses" CHECK("uses_taken" >= 0 AND ("uses_total" IS NULL OR "uses_taken" <= "uses_total")),
	CONSTRAINT "box_office_passes_named" CHECK("named" = 0 OR "account_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_pass_prices_name` ON `box_office_pass_prices` (`pass_type_id`,lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_pass_redemptions_performance` ON `box_office_pass_redemptions` (`pass_id`,`performance_id`) WHERE state = 'live';--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_pass_redemptions_show` ON `box_office_pass_redemptions` (`pass_id`,`production_id`) WHERE state = 'live' AND once = 1;--> statement-breakpoint
CREATE INDEX `box_office_pass_redemptions_order` ON `box_office_pass_redemptions` (`order_id`);--> statement-breakpoint
CREATE INDEX `box_office_pass_redemptions_claim` ON `box_office_pass_redemptions` (`claim_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_pass_shows_one` ON `box_office_pass_shows` (`pass_type_id`,`production_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_pass_types_name` ON `box_office_pass_types` (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_passes_code` ON `box_office_passes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `box_office_passes_account` ON `box_office_passes` (`account_id`) WHERE account_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_passes_type` ON `box_office_passes` (`pass_type_id`,`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_passes_line` ON `box_office_passes` (`order_line_id`) WHERE order_line_id IS NOT NULL;--> statement-breakpoint
-- Written by hand. A pass's entries taken are its live redemptions, kept by these triggers; the CHECK on uses_taken is the allowance, so the last entry is given once.
CREATE TRIGGER `box_office_pass_redemptions_insert` BEFORE INSERT ON `box_office_pass_redemptions` WHEN NEW.`state` <> 'live' BEGIN SELECT RAISE(ABORT, 'box-office: a pass entry starts live'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pass_redemptions_fixed` BEFORE UPDATE ON `box_office_pass_redemptions` WHEN NEW.`pass_id` <> OLD.`pass_id` OR NEW.`claim_id` <> OLD.`claim_id` OR NEW.`performance_id` <> OLD.`performance_id` OR NEW.`production_id` <> OLD.`production_id` OR (NEW.`state` <> OLD.`state` AND OLD.`state` = 'released') BEGIN SELECT RAISE(ABORT, 'box-office: a pass entry keeps its pass, performance and seat, and released is final'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pass_redemptions_no_delete` BEFORE DELETE ON `box_office_pass_redemptions` BEGIN SELECT RAISE(ABORT, 'box-office: a pass entry is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pass_redemptions_count_insert` AFTER INSERT ON `box_office_pass_redemptions` BEGIN UPDATE `box_office_passes` SET `uses_taken` = `uses_taken` + 1 WHERE `id` = NEW.`pass_id`; END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pass_redemptions_count_release` AFTER UPDATE OF `state` ON `box_office_pass_redemptions` WHEN OLD.`state` = 'live' AND NEW.`state` = 'released' BEGIN UPDATE `box_office_passes` SET `uses_taken` = `uses_taken` - 1 WHERE `id` = OLD.`pass_id`; END;
--> statement-breakpoint
-- A seat given back gives back the pass's entry on it: an expired basket, a released reservation, a cancelled ticket.
CREATE TRIGGER `box_office_claims_release_pass` AFTER UPDATE OF `state` ON `box_office_claims` WHEN OLD.`state` IN ('held', 'confirmed') AND NEW.`state` = 'released' BEGIN UPDATE `box_office_pass_redemptions` SET `state` = 'released', `updated_at` = coalesce(NEW.`released_at`, `updated_at`) WHERE `claim_id` = NEW.`id` AND `state` = 'live'; END;
--> statement-breakpoint
CREATE TRIGGER `box_office_passes_uses_taken` BEFORE UPDATE ON `box_office_passes` WHEN NEW.`uses_taken` <> OLD.`uses_taken` AND NEW.`uses_taken` <> (SELECT count(*) FROM `box_office_pass_redemptions` WHERE `pass_id` = NEW.`id` AND `state` = 'live') BEGIN SELECT RAISE(ABORT, 'box-office: a pass''s entries taken are its live redemptions'); END;

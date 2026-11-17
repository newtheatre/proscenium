CREATE TABLE `box_office_promo_codes` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL,
	`effect` text NOT NULL,
	`value` integer NOT NULL,
	`production_id` text,
	`performance_id` text,
	`ticket_type_id` text,
	`band_id` text,
	`max_uses` integer,
	`used` integer DEFAULT 0 NOT NULL,
	`max_per_order` integer,
	`valid_from` integer,
	`valid_until` integer,
	`active` integer DEFAULT true NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "box_office_promo_codes_effect" CHECK("effect" IN ('percent_off', 'amount_off', 'set_price')),
	CONSTRAINT "box_office_promo_codes_value" CHECK("value" >= 0 AND ("effect" <> 'percent_off' OR "value" <= 10000)),
	CONSTRAINT "box_office_promo_codes_used" CHECK("used" >= 0 AND ("max_uses" IS NULL OR "used" <= "max_uses"))
);
--> statement-breakpoint
CREATE TABLE `box_office_promo_redemptions` (
	`id` text PRIMARY KEY,
	`promo_code_id` text NOT NULL,
	`order_id` text NOT NULL,
	`claim_id` text NOT NULL,
	`state` text DEFAULT 'live' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_promo_redemptions_promo_code_id_box_office_promo_codes_id_fk` FOREIGN KEY (`promo_code_id`) REFERENCES `box_office_promo_codes`(`id`),
	CONSTRAINT "box_office_promo_redemptions_state" CHECK("state" IN ('live', 'released'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_promo_codes_code` ON `box_office_promo_codes` (`code`);--> statement-breakpoint
CREATE INDEX `box_office_promo_redemptions_order` ON `box_office_promo_redemptions` (`order_id`);--> statement-breakpoint
CREATE INDEX `box_office_promo_redemptions_claim` ON `box_office_promo_redemptions` (`claim_id`);--> statement-breakpoint
-- A code's uses are its live redemptions, kept by these triggers; the CHECK on used is the limit, so the last use is given once.
CREATE TRIGGER `box_office_promo_redemptions_insert` BEFORE INSERT ON `box_office_promo_redemptions` WHEN NEW.`state` <> 'live' BEGIN SELECT RAISE(ABORT, 'box-office: a redemption starts live'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_promo_redemptions_fixed` BEFORE UPDATE ON `box_office_promo_redemptions` WHEN NEW.`promo_code_id` <> OLD.`promo_code_id` OR NEW.`claim_id` <> OLD.`claim_id` OR (NEW.`state` <> OLD.`state` AND OLD.`state` = 'released') BEGIN SELECT RAISE(ABORT, 'box-office: a redemption keeps its code and seat, and released is final'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_promo_redemptions_no_delete` BEFORE DELETE ON `box_office_promo_redemptions` BEGIN SELECT RAISE(ABORT, 'box-office: a redemption is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_promo_redemptions_count_insert` AFTER INSERT ON `box_office_promo_redemptions` BEGIN UPDATE `box_office_promo_codes` SET `used` = `used` + 1 WHERE `id` = NEW.`promo_code_id`; END;
--> statement-breakpoint
CREATE TRIGGER `box_office_promo_redemptions_count_release` AFTER UPDATE OF `state` ON `box_office_promo_redemptions` WHEN OLD.`state` = 'live' AND NEW.`state` = 'released' BEGIN UPDATE `box_office_promo_codes` SET `used` = `used` - 1 WHERE `id` = OLD.`promo_code_id`; END;
--> statement-breakpoint
-- A seat given back gives back the code's use on it: an expired basket, a released reservation, a cancelled ticket.
CREATE TRIGGER `box_office_claims_release_promo` AFTER UPDATE OF `state` ON `box_office_claims` WHEN OLD.`state` IN ('held', 'confirmed') AND NEW.`state` = 'released' BEGIN UPDATE `box_office_promo_redemptions` SET `state` = 'released', `updated_at` = coalesce(NEW.`released_at`, `updated_at`) WHERE `claim_id` = NEW.`id` AND `state` = 'live'; END;
--> statement-breakpoint
CREATE TRIGGER `box_office_promo_codes_used` BEFORE UPDATE ON `box_office_promo_codes` WHEN NEW.`used` <> OLD.`used` AND NEW.`used` <> (SELECT count(*) FROM `box_office_promo_redemptions` WHERE `promo_code_id` = NEW.`id` AND `state` = 'live') BEGIN SELECT RAISE(ABORT, 'box-office: a code''s uses are its live redemptions'); END;

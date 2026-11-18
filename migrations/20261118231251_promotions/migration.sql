CREATE TABLE `promotions_codes` (
	`id` text PRIMARY KEY,
	`promotion_id` text NOT NULL,
	`code` text NOT NULL,
	`max_uses` integer,
	`used` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_promotions_codes_promotion_id_promotions_promotions_id_fk` FOREIGN KEY (`promotion_id`) REFERENCES `promotions_promotions`(`id`),
	CONSTRAINT "promotions_codes_used" CHECK("used" >= 0 AND ("max_uses" IS NULL OR "used" <= "max_uses"))
);
--> statement-breakpoint
CREATE TABLE `promotions_promotions` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`label` text NOT NULL,
	`trigger` text NOT NULL,
	`effect` text NOT NULL,
	`value` integer NOT NULL,
	`buy_quantity` integer,
	`free_quantity` integer,
	`channel` text DEFAULT 'all' NOT NULL,
	`valid_from` integer,
	`valid_until` integer,
	`schedule` text,
	`requirement_refs` text,
	`min_spend_minor` integer,
	`max_uses` integer,
	`used` integer DEFAULT 0 NOT NULL,
	`count_by` text DEFAULT 'item' NOT NULL,
	`max_per_sale` integer,
	`max_per_person` integer,
	`combines` integer DEFAULT false NOT NULL,
	`not_with_requirements` integer DEFAULT false NOT NULL,
	`staff_ability` text,
	`needs_reason` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`note` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "promotions_promotions_trigger" CHECK("trigger" IN ('automatic', 'code', 'staff')),
	CONSTRAINT "promotions_promotions_effect" CHECK("effect" IN ('percent_off', 'amount_off', 'set_price', 'multi_buy', 'basket_amount_off')),
	CONSTRAINT "promotions_promotions_channel" CHECK("channel" IN ('all', 'online', 'till')),
	CONSTRAINT "promotions_promotions_count_by" CHECK("count_by" IN ('item', 'sale')),
	CONSTRAINT "promotions_promotions_value" CHECK("value" >= 0 AND ("effect" <> 'percent_off' OR ("value" >= 1 AND "value" <= 10000))),
	CONSTRAINT "promotions_promotions_multi_buy" CHECK("effect" <> 'multi_buy' OR ("buy_quantity" >= 2 AND ("free_quantity" IS NULL OR ("free_quantity" >= 1 AND "free_quantity" < "buy_quantity")))),
	CONSTRAINT "promotions_promotions_used" CHECK("used" >= 0 AND ("max_uses" IS NULL OR "used" <= "max_uses"))
);
--> statement-breakpoint
CREATE TABLE `promotions_redemptions` (
	`id` text PRIMARY KEY,
	`promotion_id` text NOT NULL,
	`code_id` text,
	`kind` text NOT NULL,
	`sale_ref` text NOT NULL,
	`ref` text NOT NULL,
	`uses` integer NOT NULL,
	`discount_minor` integer NOT NULL,
	`reason` text,
	`applied_by` text,
	`state` text DEFAULT 'live' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_promotions_redemptions_promotion_id_promotions_promotions_id_fk` FOREIGN KEY (`promotion_id`) REFERENCES `promotions_promotions`(`id`),
	CONSTRAINT `fk_promotions_redemptions_code_id_promotions_codes_id_fk` FOREIGN KEY (`code_id`) REFERENCES `promotions_codes`(`id`),
	CONSTRAINT "promotions_redemptions_state" CHECK("state" IN ('live', 'released')),
	CONSTRAINT "promotions_redemptions_uses" CHECK("uses" >= 0),
	CONSTRAINT "promotions_redemptions_discount" CHECK("discount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `promotions_targets` (
	`id` text PRIMARY KEY,
	`promotion_id` text NOT NULL,
	`role` text NOT NULL,
	`kind` text NOT NULL,
	`scope` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_promotions_targets_promotion_id_promotions_promotions_id_fk` FOREIGN KEY (`promotion_id`) REFERENCES `promotions_promotions`(`id`),
	CONSTRAINT "promotions_targets_role" CHECK("role" IN ('applies', 'requires')),
	CONSTRAINT "promotions_targets_quantity" CHECK("quantity" >= 1)
);
--> statement-breakpoint
DROP INDEX IF EXISTS `box_office_promo_codes_code`;--> statement-breakpoint
DROP INDEX IF EXISTS `box_office_promo_redemptions_order`;--> statement-breakpoint
DROP INDEX IF EXISTS `box_office_promo_redemptions_claim`;--> statement-breakpoint
CREATE UNIQUE INDEX `promotions_codes_code` ON `promotions_codes` (`code`);--> statement-breakpoint
CREATE INDEX `promotions_codes_promotion` ON `promotions_codes` (`promotion_id`);--> statement-breakpoint
CREATE INDEX `promotions_promotions_live` ON `promotions_promotions` (`active`,`trigger`);--> statement-breakpoint
CREATE INDEX `promotions_redemptions_promotion` ON `promotions_redemptions` (`promotion_id`,`state`);--> statement-breakpoint
CREATE INDEX `promotions_redemptions_ref` ON `promotions_redemptions` (`kind`,`ref`);--> statement-breakpoint
CREATE INDEX `promotions_redemptions_sale` ON `promotions_redemptions` (`sale_ref`);--> statement-breakpoint
CREATE INDEX `promotions_targets_promotion` ON `promotions_targets` (`promotion_id`);--> statement-breakpoint
DROP TABLE `box_office_promo_redemptions`;--> statement-breakpoint
DROP TABLE `box_office_promo_codes`;--> statement-breakpoint
-- Written by hand. Box office's promo codes became Promotions (nothing to carry over: the codes were never used in earnest).
-- The redemptions table above is dropped before the codes it points at. The trigger that gave a code's use back with its seat
-- lived on box_office_claims, so it goes too: Promotions now asks each selling module which of its lines still stand.
DROP TRIGGER IF EXISTS `box_office_claims_release_promo`;
--> statement-breakpoint
-- A promotion's and a code's uses are their live redemptions, kept by these triggers; the CHECKs on used are the limits, so the last use is given once.
CREATE TRIGGER `promotions_redemptions_insert` BEFORE INSERT ON `promotions_redemptions` WHEN NEW.`state` <> 'live' BEGIN SELECT RAISE(ABORT, 'promotions: a redemption starts live'); END;
--> statement-breakpoint
CREATE TRIGGER `promotions_redemptions_fixed` BEFORE UPDATE ON `promotions_redemptions` WHEN NEW.`promotion_id` <> OLD.`promotion_id` OR NEW.`code_id` IS NOT OLD.`code_id` OR NEW.`ref` <> OLD.`ref` OR NEW.`uses` <> OLD.`uses` OR (NEW.`state` <> OLD.`state` AND OLD.`state` = 'released') BEGIN SELECT RAISE(ABORT, 'promotions: a redemption keeps its promotion, code, line and uses, and released is final'); END;
--> statement-breakpoint
CREATE TRIGGER `promotions_redemptions_no_delete` BEFORE DELETE ON `promotions_redemptions` BEGIN SELECT RAISE(ABORT, 'promotions: a redemption is never deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `promotions_redemptions_count_insert` AFTER INSERT ON `promotions_redemptions` BEGIN UPDATE `promotions_promotions` SET `used` = `used` + NEW.`uses` WHERE `id` = NEW.`promotion_id`; UPDATE `promotions_codes` SET `used` = `used` + NEW.`uses` WHERE `id` = NEW.`code_id`; END;
--> statement-breakpoint
CREATE TRIGGER `promotions_redemptions_count_release` AFTER UPDATE OF `state` ON `promotions_redemptions` WHEN OLD.`state` = 'live' AND NEW.`state` = 'released' BEGIN UPDATE `promotions_promotions` SET `used` = `used` - OLD.`uses` WHERE `id` = OLD.`promotion_id`; UPDATE `promotions_codes` SET `used` = `used` - OLD.`uses` WHERE `id` = OLD.`code_id`; END;
--> statement-breakpoint
CREATE TRIGGER `promotions_promotions_used` BEFORE UPDATE ON `promotions_promotions` WHEN NEW.`used` <> OLD.`used` AND NEW.`used` <> (SELECT coalesce(sum(`uses`), 0) FROM `promotions_redemptions` WHERE `promotion_id` = NEW.`id` AND `state` = 'live') BEGIN SELECT RAISE(ABORT, 'promotions: a promotion''s uses are its live redemptions'); END;
--> statement-breakpoint
CREATE TRIGGER `promotions_codes_used` BEFORE UPDATE ON `promotions_codes` WHEN NEW.`used` <> OLD.`used` AND NEW.`used` <> (SELECT coalesce(sum(`uses`), 0) FROM `promotions_redemptions` WHERE `code_id` = NEW.`id` AND `state` = 'live') BEGIN SELECT RAISE(ABORT, 'promotions: a code''s uses are its live redemptions'); END;

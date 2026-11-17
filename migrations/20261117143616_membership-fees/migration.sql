CREATE TABLE `membership_fees_charges` (
	`id` text PRIMARY KEY,
	`membership_id` text NOT NULL,
	`price_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`tax_code` text NOT NULL,
	`state` text NOT NULL,
	`intent_id` text,
	`channel` text,
	`refunded_minor` integer DEFAULT 0 NOT NULL,
	`paid_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_membership_fees_charges_membership_id_membership_memberships_id_fk` FOREIGN KEY (`membership_id`) REFERENCES `membership_memberships`(`id`),
	CONSTRAINT `fk_membership_fees_charges_price_id_membership_fees_prices_id_fk` FOREIGN KEY (`price_id`) REFERENCES `membership_fees_prices`(`id`),
	CONSTRAINT `fk_membership_fees_charges_intent_id_payments_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `payments_intents`(`id`),
	CONSTRAINT "membership_fees_charges_amount" CHECK("amount_minor" >= 1),
	CONSTRAINT "membership_fees_charges_state" CHECK("state" IN ('open', 'paid', 'void', 'refunded', 'part-refunded')),
	CONSTRAINT "membership_fees_charges_refunded" CHECK("refunded_minor" >= 0 AND "refunded_minor" <= "amount_minor"),
	CONSTRAINT "membership_fees_charges_paid" CHECK("state" <> 'paid' OR ("intent_id" IS NOT NULL AND "paid_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `membership_fees_prices` (
	`id` text PRIMARY KEY,
	`scheme_id` text NOT NULL,
	`length_option_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`tax_code` text DEFAULT 'none' NOT NULL,
	`applies_to` text NOT NULL,
	`from_date` text NOT NULL,
	`set_by` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_membership_fees_prices_scheme_id_membership_schemes_id_fk` FOREIGN KEY (`scheme_id`) REFERENCES `membership_schemes`(`id`),
	CONSTRAINT `fk_membership_fees_prices_length_option_id_membership_length_options_id_fk` FOREIGN KEY (`length_option_id`) REFERENCES `membership_length_options`(`id`),
	CONSTRAINT "membership_fees_prices_amount" CHECK("amount_minor" >= 1),
	CONSTRAINT "membership_fees_prices_applies" CHECK("applies_to" IN ('join-and-renew', 'join', 'renew'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_fees_charges_once` ON `membership_fees_charges` (`membership_id`) WHERE state <> 'void';--> statement-breakpoint
CREATE INDEX `membership_fees_charges_intent` ON `membership_fees_charges` (`intent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_fees_prices_one_a_day` ON `membership_fees_prices` (`scheme_id`,coalesce(length_option_id, ''),`applies_to`,`from_date`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `membership_fees_prices_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `membership_fees_prices_append_only_delete` BEFORE DELETE ON `membership_fees_prices` BEGIN SELECT RAISE(ABORT, 'append-only: membership_fees_prices'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `membership_fees_prices_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `membership_fees_prices_append_only_update` BEFORE UPDATE ON `membership_fees_prices` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`scheme_id` IS OLD.`scheme_id` AND NEW.`length_option_id` IS OLD.`length_option_id` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`currency` IS OLD.`currency` AND NEW.`tax_code` IS OLD.`tax_code` AND NEW.`applies_to` IS OLD.`applies_to` AND NEW.`from_date` IS OLD.`from_date` AND NEW.`set_by` IS OLD.`set_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: membership_fees_prices'); END;

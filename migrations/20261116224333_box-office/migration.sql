CREATE TABLE `box_office_bands` (
	`id` text PRIMARY KEY,
	`production_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'standard' NOT NULL,
	`displaces_band_id` text,
	`displaces_units` integer DEFAULT 2 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_bands_displaces_band_id_box_office_bands_id_fk` FOREIGN KEY (`displaces_band_id`) REFERENCES `box_office_bands`(`id`),
	CONSTRAINT "box_office_bands_kind" CHECK("kind" IN ('standard', 'wheelchair', 'restricted_view')),
	CONSTRAINT "box_office_bands_displaces" CHECK("displaces_units" >= 1 AND ("displaces_band_id" IS NULL OR "kind" = 'wheelchair'))
);
--> statement-breakpoint
CREATE TABLE `box_office_cancellations` (
	`id` text PRIMARY KEY,
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`reason_term_id` text,
	`note` text,
	`line_ids` text NOT NULL,
	`refund_id` text,
	`fee_minor` integer DEFAULT 0 NOT NULL,
	`by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_cancellations_order_id_box_office_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `box_office_orders`(`id`),
	CONSTRAINT `fk_box_office_cancellations_reason_term_id_core_terms_id_fk` FOREIGN KEY (`reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT `fk_box_office_cancellations_refund_id_payments_refunds_id_fk` FOREIGN KEY (`refund_id`) REFERENCES `payments_refunds`(`id`),
	CONSTRAINT "box_office_cancellations_kind" CHECK("kind" IN ('customer', 'staff', 'performance_cancelled', 'exchange', 'unfulfilled_payment')),
	CONSTRAINT "box_office_cancellations_note" CHECK("note" IS NULL OR length("note") <= 200),
	CONSTRAINT "box_office_cancellations_fee" CHECK("fee_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `box_office_claims` (
	`id` text PRIMARY KEY,
	`pool_id` text NOT NULL,
	`seat_id` text,
	`hold_id` text NOT NULL,
	`displaced_for_id` text,
	`state` text NOT NULL,
	`expires_at` integer,
	`released_at` integer,
	`release_reason` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_claims_pool_id_box_office_pools_id_fk` FOREIGN KEY (`pool_id`) REFERENCES `box_office_pools`(`id`),
	CONSTRAINT `fk_box_office_claims_hold_id_box_office_holds_id_fk` FOREIGN KEY (`hold_id`) REFERENCES `box_office_holds`(`id`),
	CONSTRAINT `fk_box_office_claims_displaced_for_id_box_office_claims_id_fk` FOREIGN KEY (`displaced_for_id`) REFERENCES `box_office_claims`(`id`),
	CONSTRAINT "box_office_claims_state" CHECK("state" IN ('held', 'confirmed', 'released')),
	CONSTRAINT "box_office_claims_released" CHECK(("state" = 'released') = ("released_at" IS NOT NULL) AND ("state" = 'released') = ("release_reason" IS NOT NULL)),
	CONSTRAINT "box_office_claims_reason" CHECK("release_reason" IS NULL OR "release_reason" IN ('expired', 'abandoned', 'cancelled', 'exchanged', 'staff', 'payment_failed')),
	CONSTRAINT "box_office_claims_confirmed" CHECK("state" <> 'confirmed' OR "expires_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE `box_office_holds` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`order_id` text,
	`label` text,
	`held_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_holds_order_id_box_office_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `box_office_orders`(`id`),
	CONSTRAINT "box_office_holds_kind" CHECK("kind" IN ('basket', 'payment', 'reservation', 'staff', 'waitlist_offer')),
	CONSTRAINT "box_office_holds_owner" CHECK(("kind" = 'staff') = ("order_id" IS NULL)),
	CONSTRAINT "box_office_holds_label" CHECK("label" IS NULL OR ("kind" = 'staff' AND length("label") <= 80))
);
--> statement-breakpoint
CREATE TABLE `box_office_order_lines` (
	`id` text PRIMARY KEY,
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`performance_id` text,
	`band_id` text,
	`ticket_type_id` text,
	`claim_id` text,
	`list_minor` integer NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`amount_minor` integer NOT NULL,
	`promo_redemption_id` text,
	`pass_redemption_id` text,
	`comp_request_id` text,
	`state` text DEFAULT 'live' NOT NULL,
	`replaces_line_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_order_lines_order_id_box_office_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `box_office_orders`(`id`),
	CONSTRAINT `fk_box_office_order_lines_band_id_box_office_bands_id_fk` FOREIGN KEY (`band_id`) REFERENCES `box_office_bands`(`id`),
	CONSTRAINT `fk_box_office_order_lines_ticket_type_id_box_office_ticket_types_id_fk` FOREIGN KEY (`ticket_type_id`) REFERENCES `box_office_ticket_types`(`id`),
	CONSTRAINT `fk_box_office_order_lines_claim_id_box_office_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `box_office_claims`(`id`),
	CONSTRAINT `fk_box_office_order_lines_replaces_line_id_box_office_order_lines_id_fk` FOREIGN KEY (`replaces_line_id`) REFERENCES `box_office_order_lines`(`id`),
	CONSTRAINT "box_office_order_lines_kind" CHECK("kind" IN ('ticket', 'booking_fee', 'donation', 'pass_sale', 'exchange_fee', 'adjustment')),
	CONSTRAINT "box_office_order_lines_ticket" CHECK("kind" <> 'ticket' OR ("performance_id" IS NOT NULL AND "band_id" IS NOT NULL AND "ticket_type_id" IS NOT NULL AND "claim_id" IS NOT NULL)),
	CONSTRAINT "box_office_order_lines_list" CHECK("list_minor" >= 0),
	CONSTRAINT "box_office_order_lines_discount" CHECK("discount_minor" >= 0 AND "discount_minor" <= "list_minor"),
	CONSTRAINT "box_office_order_lines_amount" CHECK("amount_minor" = "list_minor" - "discount_minor"),
	CONSTRAINT "box_office_order_lines_one_discount" CHECK("promo_redemption_id" IS NULL OR "pass_redemption_id" IS NULL),
	CONSTRAINT "box_office_order_lines_state" CHECK("state" IN ('live', 'cancelled', 'exchanged'))
);
--> statement-breakpoint
CREATE TABLE `box_office_orders` (
	`id` text PRIMARY KEY,
	`reference` text NOT NULL,
	`channel` text NOT NULL,
	`state` text NOT NULL,
	`account_id` text,
	`signed_in` integer DEFAULT false NOT NULL,
	`access_note` text,
	`currency` text NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`sold_by` text,
	`session_id` text,
	`intent_id` text,
	`link_token_hash` text,
	`desk_code_hash` text,
	`expires_at` integer,
	`extended_at` integer,
	`release_at` integer,
	`keep` integer DEFAULT false NOT NULL,
	`confirmed_at` integer,
	`cancelled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_orders_session_id_payments_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `payments_sessions`(`id`),
	CONSTRAINT `fk_box_office_orders_intent_id_payments_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `payments_intents`(`id`),
	CONSTRAINT "box_office_orders_channel" CHECK("channel" IN ('online', 'desk', 'phone')),
	CONSTRAINT "box_office_orders_state" CHECK("state" IN ('basket', 'reserved', 'awaiting_payment', 'confirmed', 'cancelled', 'expired')),
	CONSTRAINT "box_office_orders_total" CHECK("total_minor" >= 0),
	CONSTRAINT "box_office_orders_account_needed" CHECK("account_id" IS NOT NULL OR "state" IN ('basket', 'expired') OR ("channel" = 'desk' AND "access_note" IS NULL AND "state" <> 'reserved'))
);
--> statement-breakpoint
CREATE TABLE `box_office_performance_sales` (
	`id` text PRIMARY KEY,
	`performance_id` text NOT NULL,
	`seating` text DEFAULT 'general' NOT NULL,
	`plan_id` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`on_sale_at` integer,
	`off_sale_at` integer,
	`max_per_order` integer,
	`hold_minutes` integer,
	`payment_timing` text,
	`change_decision` text,
	`change_decided_by` text,
	`change_decided_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "box_office_performance_sales_seating" CHECK("seating" IN ('general', 'allocated')),
	CONSTRAINT "box_office_performance_sales_plan" CHECK("seating" = 'general' OR "plan_id" IS NOT NULL),
	CONSTRAINT "box_office_performance_sales_state" CHECK("state" IN ('draft', 'on_sale', 'paused', 'closed')),
	CONSTRAINT "box_office_performance_sales_cap" CHECK("max_per_order" IS NULL OR "max_per_order" > 0),
	CONSTRAINT "box_office_performance_sales_hold" CHECK("hold_minutes" IS NULL OR "hold_minutes" > 0),
	CONSTRAINT "box_office_performance_sales_timing" CHECK("payment_timing" IS NULL OR "payment_timing" IN ('pay-now', 'reserve', 'buyer-chooses')),
	CONSTRAINT "box_office_performance_sales_decision" CHECK("change_decision" IS NULL OR "change_decision" IN ('refund_all', 'offer_exchange', 'keep'))
);
--> statement-breakpoint
CREATE TABLE `box_office_pools` (
	`id` text PRIMARY KEY,
	`performance_id` text NOT NULL,
	`band_id` text NOT NULL,
	`capacity` integer NOT NULL,
	`claimed` integer DEFAULT 0 NOT NULL,
	`over_venue_confirmed_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_pools_band_id_box_office_bands_id_fk` FOREIGN KEY (`band_id`) REFERENCES `box_office_bands`(`id`),
	CONSTRAINT "box_office_pools_capacity" CHECK("capacity" >= 0),
	CONSTRAINT "box_office_pools_claimed" CHECK("claimed" >= 0 AND "claimed" <= "capacity")
);
--> statement-breakpoint
CREATE TABLE `box_office_prices` (
	`id` text PRIMARY KEY,
	`production_id` text NOT NULL,
	`performance_id` text,
	`band_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`amount_minor` integer,
	`currency` text NOT NULL,
	`effective_from` integer NOT NULL,
	`set_by` text,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_prices_band_id_box_office_bands_id_fk` FOREIGN KEY (`band_id`) REFERENCES `box_office_bands`(`id`),
	CONSTRAINT `fk_box_office_prices_ticket_type_id_box_office_ticket_types_id_fk` FOREIGN KEY (`ticket_type_id`) REFERENCES `box_office_ticket_types`(`id`),
	CONSTRAINT "box_office_prices_amount" CHECK("amount_minor" IS NULL OR "amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE `box_office_scans` (
	`id` text PRIMARY KEY,
	`ticket_id` text,
	`performance_id` text NOT NULL,
	`result` text NOT NULL,
	`reason_term_id` text,
	`unchecked` integer DEFAULT false NOT NULL,
	`scanned_by` text NOT NULL,
	`device_label` text,
	`scanned_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`offline` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_box_office_scans_ticket_id_box_office_tickets_id_fk` FOREIGN KEY (`ticket_id`) REFERENCES `box_office_tickets`(`id`),
	CONSTRAINT `fk_box_office_scans_reason_term_id_core_terms_id_fk` FOREIGN KEY (`reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "box_office_scans_result" CHECK("result" IN ('admitted', 'admitted_by_override', 'already_admitted', 'void', 'wrong_performance', 'requirement_not_met', 'unknown', 'bad_signature', 'reversed')),
	CONSTRAINT "box_office_scans_reason" CHECK("result" NOT IN ('reversed', 'admitted_by_override') OR "reason_term_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `box_office_ticket_types` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`kind` text DEFAULT 'standard' NOT NULL,
	`requirement_refs` text,
	`recheck_at_entry` integer DEFAULT true NOT NULL,
	`max_per_holder` integer DEFAULT 1 NOT NULL,
	`proof_note` text,
	`needs_paid_ticket` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "box_office_ticket_types_kind" CHECK("kind" IN ('standard', 'concession', 'companion', 'complimentary')),
	CONSTRAINT "box_office_ticket_types_holder" CHECK("max_per_holder" >= 1)
);
--> statement-breakpoint
CREATE TABLE `box_office_tickets` (
	`id` text PRIMARY KEY,
	`order_line_id` text NOT NULL,
	`performance_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`key_id` text NOT NULL,
	`state` text DEFAULT 'valid' NOT NULL,
	`void_reason` text,
	`attendee_name` text,
	`admitted_at` integer,
	`requirement_ref` text,
	`requirement_account_id` text,
	`requirement_evidence_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_tickets_order_line_id_box_office_order_lines_id_fk` FOREIGN KEY (`order_line_id`) REFERENCES `box_office_order_lines`(`id`),
	CONSTRAINT "box_office_tickets_state" CHECK("state" IN ('valid', 'void')),
	CONSTRAINT "box_office_tickets_void" CHECK(("state" = 'void') = ("void_reason" IS NOT NULL)),
	CONSTRAINT "box_office_tickets_reason" CHECK("void_reason" IS NULL OR "void_reason" IN ('cancelled', 'exchanged', 'reissued', 'performance_cancelled')),
	CONSTRAINT "box_office_tickets_requirement" CHECK("requirement_ref" IS NULL OR "requirement_account_id" IS NOT NULL OR "requirement_evidence_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_bands_name` ON `box_office_bands` (`production_id`,`name`);--> statement-breakpoint
CREATE INDEX `box_office_cancellations_order` ON `box_office_cancellations` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_claims_one_live_per_seat` ON `box_office_claims` (`pool_id`,`seat_id`) WHERE seat_id IS NOT NULL AND state IN ('held', 'confirmed');--> statement-breakpoint
CREATE INDEX `box_office_claims_pool` ON `box_office_claims` (`pool_id`,`state`,`expires_at`);--> statement-breakpoint
CREATE INDEX `box_office_claims_hold` ON `box_office_claims` (`hold_id`);--> statement-breakpoint
CREATE INDEX `box_office_holds_order` ON `box_office_holds` (`order_id`) WHERE order_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_order_lines_order` ON `box_office_order_lines` (`order_id`);--> statement-breakpoint
CREATE INDEX `box_office_order_lines_performance` ON `box_office_order_lines` (`performance_id`,`state`) WHERE performance_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_order_lines_claim` ON `box_office_order_lines` (`claim_id`) WHERE claim_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_orders_reference` ON `box_office_orders` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_orders_link` ON `box_office_orders` (`link_token_hash`) WHERE link_token_hash IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_orders_desk_code` ON `box_office_orders` (`desk_code_hash`) WHERE desk_code_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_orders_account` ON `box_office_orders` (`account_id`) WHERE account_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_orders_expiring` ON `box_office_orders` (`state`,`expires_at`);--> statement-breakpoint
CREATE INDEX `box_office_orders_releasing` ON `box_office_orders` (`state`,`release_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_performance_sales_performance` ON `box_office_performance_sales` (`performance_id`);--> statement-breakpoint
CREATE INDEX `box_office_performance_sales_due` ON `box_office_performance_sales` (`state`,`on_sale_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_pools_band` ON `box_office_pools` (`performance_id`,`band_id`);--> statement-breakpoint
CREATE INDEX `box_office_prices_lookup` ON `box_office_prices` (`production_id`,`band_id`,`ticket_type_id`,`effective_from`);--> statement-breakpoint
CREATE INDEX `box_office_scans_ticket` ON `box_office_scans` (`ticket_id`) WHERE ticket_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_scans_performance` ON `box_office_scans` (`performance_id`,`received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_ticket_types_name` ON `box_office_ticket_types` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_tickets_code` ON `box_office_tickets` (`code_hash`);--> statement-breakpoint
CREATE INDEX `box_office_tickets_line` ON `box_office_tickets` (`order_line_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_tickets_one_valid` ON `box_office_tickets` (`order_line_id`) WHERE state = 'valid';--> statement-breakpoint
CREATE INDEX `box_office_tickets_performance` ON `box_office_tickets` (`performance_id`,`state`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_prices_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `box_office_prices_append_only_delete` BEFORE DELETE ON `box_office_prices` BEGIN SELECT RAISE(ABORT, 'append-only: box_office_prices'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_prices_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `box_office_prices_append_only_update` BEFORE UPDATE ON `box_office_prices` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`production_id` IS OLD.`production_id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`band_id` IS OLD.`band_id` AND NEW.`ticket_type_id` IS OLD.`ticket_type_id` AND NEW.`amount_minor` IS OLD.`amount_minor` AND NEW.`currency` IS OLD.`currency` AND NEW.`effective_from` IS OLD.`effective_from` AND NEW.`set_by` IS OLD.`set_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: box_office_prices'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_scans_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `box_office_scans_append_only_delete` BEFORE DELETE ON `box_office_scans` BEGIN SELECT RAISE(ABORT, 'append-only: box_office_scans'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_scans_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `box_office_scans_append_only_update` BEFORE UPDATE ON `box_office_scans` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`ticket_id` IS OLD.`ticket_id` AND NEW.`performance_id` IS OLD.`performance_id` AND NEW.`result` IS OLD.`result` AND NEW.`reason_term_id` IS OLD.`reason_term_id` AND NEW.`unchecked` IS OLD.`unchecked` AND NEW.`scanned_by` IS OLD.`scanned_by` AND NEW.`device_label` IS OLD.`device_label` AND NEW.`scanned_at` IS OLD.`scanned_at` AND NEW.`received_at` IS OLD.`received_at` AND NEW.`offline` IS OLD.`offline`) BEGIN SELECT RAISE(ABORT, 'append-only: box_office_scans'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_cancellations_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `box_office_cancellations_append_only_delete` BEFORE DELETE ON `box_office_cancellations` BEGIN SELECT RAISE(ABORT, 'append-only: box_office_cancellations'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `box_office_cancellations_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `box_office_cancellations_append_only_update` BEFORE UPDATE ON `box_office_cancellations` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`order_id` IS OLD.`order_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`reason_term_id` IS OLD.`reason_term_id` AND (NEW.`note` IS OLD.`note` OR NEW.`note` IS '[removed]') AND NEW.`line_ids` IS OLD.`line_ids` AND NEW.`refund_id` IS OLD.`refund_id` AND NEW.`fee_minor` IS OLD.`fee_minor` AND NEW.`by` IS OLD.`by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: box_office_cancellations'); END;
--> statement-breakpoint
-- Written by hand: Box office's own rules (Box office specification, parts 2 and 3). Claims are the
-- truth about what is sold. A claim starts live, moves only towards released, and is never deleted;
-- released is final; its pool and seat never change.
CREATE TRIGGER `box_office_claims_insert` BEFORE INSERT ON `box_office_claims` WHEN NEW.`state` NOT IN ('held', 'confirmed') BEGIN SELECT RAISE(ABORT, 'box-office: a claim starts held or confirmed'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_claims_fixed` BEFORE UPDATE ON `box_office_claims` WHEN NEW.`pool_id` <> OLD.`pool_id` OR NEW.`seat_id` IS NOT OLD.`seat_id` OR NEW.`displaced_for_id` IS NOT OLD.`displaced_for_id` OR (NEW.`state` <> OLD.`state` AND NOT ((OLD.`state` = 'held' AND NEW.`state` IN ('confirmed', 'released')) OR (OLD.`state` = 'confirmed' AND NEW.`state` = 'released'))) BEGIN SELECT RAISE(ABORT, 'box-office: a claim keeps its pool and seat, and released is final'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_claims_no_delete` BEFORE DELETE ON `box_office_claims` BEGIN SELECT RAISE(ABORT, 'box-office: a claim is never deleted'); END;
--> statement-breakpoint
-- Only these two triggers move a pool's counter: plus one for a live claim, minus one on release.
-- The pool's CHECK then refuses a claim past capacity, and with it the whole batch.
CREATE TRIGGER `box_office_claims_count_insert` AFTER INSERT ON `box_office_claims` BEGIN UPDATE `box_office_pools` SET `claimed` = `claimed` + 1 WHERE `id` = NEW.`pool_id`; END;
--> statement-breakpoint
CREATE TRIGGER `box_office_claims_count_release` AFTER UPDATE OF `state` ON `box_office_claims` WHEN OLD.`state` IN ('held', 'confirmed') AND NEW.`state` = 'released' BEGIN UPDATE `box_office_pools` SET `claimed` = `claimed` - 1 WHERE `id` = OLD.`pool_id`; END;
--> statement-breakpoint
-- A pool starts empty, keeps its performance and band, and its counter can only ever equal the
-- number of its live claims, so no statement can force it.
CREATE TRIGGER `box_office_pools_insert` BEFORE INSERT ON `box_office_pools` WHEN NEW.`claimed` <> 0 BEGIN SELECT RAISE(ABORT, 'box-office: a pool starts with nothing claimed'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pools_fixed` BEFORE UPDATE ON `box_office_pools` WHEN NEW.`performance_id` <> OLD.`performance_id` OR NEW.`band_id` <> OLD.`band_id` OR (NEW.`claimed` <> OLD.`claimed` AND NEW.`claimed` <> (SELECT count(*) FROM `box_office_claims` WHERE `pool_id` = NEW.`id` AND `state` IN ('held', 'confirmed'))) BEGIN SELECT RAISE(ABORT, 'box-office: a pool keeps its band, and its counter is its live claims'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_pools_no_delete` BEFORE DELETE ON `box_office_pools` WHEN EXISTS (SELECT 1 FROM `box_office_claims` WHERE `pool_id` = OLD.`id`) BEGIN SELECT RAISE(ABORT, 'box-office: a pool with claims is never deleted'); END;
--> statement-breakpoint
-- An order starts as a basket and moves only along its life cycle (part 3, "An order"). Confirmed
-- and cancelled orders are never deleted.
CREATE TRIGGER `box_office_orders_insert` BEFORE INSERT ON `box_office_orders` WHEN NEW.`state` <> 'basket' BEGIN SELECT RAISE(ABORT, 'box-office: an order starts as a basket'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_orders_fixed` BEFORE UPDATE ON `box_office_orders` WHEN NEW.`reference` <> OLD.`reference` OR NEW.`channel` <> OLD.`channel` OR NEW.`currency` <> OLD.`currency` OR (NEW.`state` <> OLD.`state` AND NOT ((OLD.`state` = 'basket' AND NEW.`state` IN ('awaiting_payment', 'confirmed', 'reserved', 'expired')) OR (OLD.`state` = 'awaiting_payment' AND NEW.`state` IN ('confirmed', 'reserved', 'expired', 'cancelled')) OR (OLD.`state` = 'reserved' AND NEW.`state` IN ('awaiting_payment', 'confirmed', 'cancelled', 'expired')) OR (OLD.`state` = 'confirmed' AND NEW.`state` = 'cancelled'))) BEGIN SELECT RAISE(ABORT, 'box-office: an order moves only along its life cycle'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_orders_no_delete` BEFORE DELETE ON `box_office_orders` WHEN OLD.`state` NOT IN ('basket', 'expired') BEGIN SELECT RAISE(ABORT, 'box-office: an order that was reserved or sold is never deleted'); END;
--> statement-breakpoint
-- A line keeps its order, kind and claim; cancelled and exchanged are final.
CREATE TRIGGER `box_office_order_lines_fixed` BEFORE UPDATE ON `box_office_order_lines` WHEN NEW.`order_id` <> OLD.`order_id` OR NEW.`kind` <> OLD.`kind` OR NEW.`claim_id` IS NOT OLD.`claim_id` OR (NEW.`state` <> OLD.`state` AND OLD.`state` <> 'live') BEGIN SELECT RAISE(ABORT, 'box-office: a line keeps its order and claim, and a cancelled line stays cancelled'); END;
--> statement-breakpoint
-- A ticket keeps its line, performance and code; void is final, admission needs a valid ticket, and
-- a ticket is never deleted.
CREATE TRIGGER `box_office_tickets_fixed` BEFORE UPDATE ON `box_office_tickets` WHEN NEW.`order_line_id` <> OLD.`order_line_id` OR NEW.`performance_id` <> OLD.`performance_id` OR NEW.`code_hash` <> OLD.`code_hash` OR NEW.`key_id` <> OLD.`key_id` OR (OLD.`state` = 'void' AND NEW.`state` <> 'void') OR (NEW.`admitted_at` IS NOT NULL AND OLD.`admitted_at` IS NULL AND OLD.`state` <> 'valid') BEGIN SELECT RAISE(ABORT, 'box-office: a ticket keeps its code, void is final, and only a valid ticket is admitted'); END;
--> statement-breakpoint
CREATE TRIGGER `box_office_tickets_no_delete` BEFORE DELETE ON `box_office_tickets` BEGIN SELECT RAISE(ABORT, 'box-office: a ticket is never deleted'); END;

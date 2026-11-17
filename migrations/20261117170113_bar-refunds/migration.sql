CREATE TABLE `bar_sale_reversals` (
	`id` text PRIMARY KEY,
	`sale_line_id` text NOT NULL,
	`refund_id` text NOT NULL,
	`state` text NOT NULL,
	`quantity` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`reason_term` text NOT NULL,
	`stock_outcome` text NOT NULL,
	`requested_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_bar_sale_reversals_sale_line_id_bar_sale_lines_id_fk` FOREIGN KEY (`sale_line_id`) REFERENCES `bar_sale_lines`(`id`),
	CONSTRAINT `fk_bar_sale_reversals_reason_term_core_terms_id_fk` FOREIGN KEY (`reason_term`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "bar_sale_reversals_state" CHECK("state" IN ('requested', 'succeeded', 'failed')),
	CONSTRAINT "bar_sale_reversals_stock" CHECK("stock_outcome" IN ('returned', 'wasted', 'none')),
	CONSTRAINT "bar_sale_reversals_quantity" CHECK("quantity" >= 0),
	CONSTRAINT "bar_sale_reversals_amount" CHECK("amount_minor" > 0)
);
--> statement-breakpoint
CREATE INDEX `bar_sale_reversals_line` ON `bar_sale_reversals` (`sale_line_id`,`state`);--> statement-breakpoint
CREATE INDEX `bar_sale_reversals_refund` ON `bar_sale_reversals` (`refund_id`);--> statement-breakpoint
-- Written by hand: what a refund holds against a line (Bar specification, tab 2, bar_sale_reversals). Re-append after regenerating.
CREATE TRIGGER `bar_sale_reversals_paid_line` BEFORE INSERT ON `bar_sale_reversals` WHEN NEW.`state` <> 'requested' OR NOT EXISTS (SELECT 1 FROM `bar_sale_lines` l JOIN `bar_sales` s ON s.`id` = l.`sale_id` WHERE l.`id` = NEW.`sale_line_id` AND s.`state` = 'paid') BEGIN SELECT RAISE(ABORT, 'bar: only a paid line is refunded, and a refund starts requested'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_reversals_within_line` BEFORE INSERT ON `bar_sale_reversals` WHEN (SELECT l.`quantity` - coalesce((SELECT sum(r.`quantity`) FROM `bar_sale_reversals` r WHERE r.`sale_line_id` = l.`id` AND r.`state` <> 'failed'), 0) FROM `bar_sale_lines` l WHERE l.`id` = NEW.`sale_line_id`) < NEW.`quantity` OR (SELECT l.`amount_minor` - coalesce((SELECT sum(r.`amount_minor`) FROM `bar_sale_reversals` r WHERE r.`sale_line_id` = l.`id` AND r.`state` <> 'failed'), 0) FROM `bar_sale_lines` l WHERE l.`id` = NEW.`sale_line_id`) < NEW.`amount_minor` BEGIN SELECT RAISE(ABORT, 'bar: a refund cannot pass what was sold on the line'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_reversals_fixed` BEFORE UPDATE ON `bar_sale_reversals` WHEN NEW.`sale_line_id` <> OLD.`sale_line_id` OR NEW.`refund_id` <> OLD.`refund_id` OR NEW.`quantity` <> OLD.`quantity` OR NEW.`amount_minor` <> OLD.`amount_minor` OR NEW.`reason_term` <> OLD.`reason_term` OR NEW.`stock_outcome` <> OLD.`stock_outcome` OR (NEW.`state` <> OLD.`state` AND NOT (OLD.`state` = 'requested' AND NEW.`state` IN ('succeeded', 'failed'))) BEGIN SELECT RAISE(ABORT, 'bar: a reversal only moves from requested to succeeded or failed'); END;
--> statement-breakpoint
CREATE TRIGGER `bar_sale_reversals_kept` BEFORE DELETE ON `bar_sale_reversals` BEGIN SELECT RAISE(ABORT, 'bar: a reversal is never deleted'); END;

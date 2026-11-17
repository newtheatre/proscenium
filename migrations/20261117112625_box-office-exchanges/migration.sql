CREATE TABLE `box_office_exchanges` (
	`id` text PRIMARY KEY,
	`order_id` text NOT NULL,
	`line_ids` text NOT NULL,
	`performance_id` text NOT NULL,
	`band_id` text NOT NULL,
	`ticket_type_id` text NOT NULL,
	`price_minor` integer NOT NULL,
	`difference_minor` integer NOT NULL,
	`hold_id` text NOT NULL,
	`intent_id` text,
	`state` text DEFAULT 'awaiting_payment' NOT NULL,
	`cancellation_id` text,
	`by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_exchanges_order_id_box_office_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `box_office_orders`(`id`),
	CONSTRAINT `fk_box_office_exchanges_band_id_box_office_bands_id_fk` FOREIGN KEY (`band_id`) REFERENCES `box_office_bands`(`id`),
	CONSTRAINT `fk_box_office_exchanges_ticket_type_id_box_office_ticket_types_id_fk` FOREIGN KEY (`ticket_type_id`) REFERENCES `box_office_ticket_types`(`id`),
	CONSTRAINT `fk_box_office_exchanges_hold_id_box_office_holds_id_fk` FOREIGN KEY (`hold_id`) REFERENCES `box_office_holds`(`id`),
	CONSTRAINT `fk_box_office_exchanges_intent_id_payments_intents_id_fk` FOREIGN KEY (`intent_id`) REFERENCES `payments_intents`(`id`),
	CONSTRAINT `fk_box_office_exchanges_cancellation_id_box_office_cancellations_id_fk` FOREIGN KEY (`cancellation_id`) REFERENCES `box_office_cancellations`(`id`),
	CONSTRAINT "box_office_exchanges_state" CHECK("state" IN ('awaiting_payment', 'completed', 'released')),
	CONSTRAINT "box_office_exchanges_difference" CHECK("difference_minor" > 0 AND "price_minor" > 0)
);
--> statement-breakpoint
CREATE INDEX `box_office_exchanges_order` ON `box_office_exchanges` (`order_id`);--> statement-breakpoint
CREATE INDEX `box_office_exchanges_intent` ON `box_office_exchanges` (`intent_id`) WHERE intent_id IS NOT NULL;
CREATE TABLE `box_office_comp_requests` (
	`id` text PRIMARY KEY,
	`performance_id` text NOT NULL,
	`band_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`for_account_id` text NOT NULL,
	`reason_term_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`state` text DEFAULT 'requested' NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`order_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_comp_requests_band_id_box_office_bands_id_fk` FOREIGN KEY (`band_id`) REFERENCES `box_office_bands`(`id`),
	CONSTRAINT `fk_box_office_comp_requests_reason_term_id_core_terms_id_fk` FOREIGN KEY (`reason_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT `fk_box_office_comp_requests_order_id_box_office_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `box_office_orders`(`id`),
	CONSTRAINT "box_office_comp_requests_quantity" CHECK("quantity" > 0),
	CONSTRAINT "box_office_comp_requests_state" CHECK("state" IN ('requested', 'approved', 'declined', 'issued', 'withdrawn')),
	CONSTRAINT "box_office_comp_requests_not_own" CHECK("decided_by" IS NULL OR "decided_by" <> "requested_by")
);
--> statement-breakpoint
CREATE INDEX `box_office_comp_requests_performance` ON `box_office_comp_requests` (`performance_id`,`state`);--> statement-breakpoint
CREATE INDEX `box_office_comp_requests_state` ON `box_office_comp_requests` (`state`,`created_at`);
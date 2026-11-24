CREATE TABLE `inventory_categories` (
	`id` text PRIMARY KEY,
	`department_id` text NOT NULL,
	`name` text NOT NULL,
	`requirements` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_inventory_categories_department_id_inventory_departments_id_fk` FOREIGN KEY (`department_id`) REFERENCES `inventory_departments`(`id`),
	CONSTRAINT "inventory_categories_name_length" CHECK(length("name") BETWEEN 1 AND 60),
	CONSTRAINT "inventory_categories_state" CHECK("state" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE `inventory_category_inspections` (
	`category_id` text NOT NULL,
	`kind_id` text NOT NULL,
	CONSTRAINT `inventory_category_inspections_pk` PRIMARY KEY(`category_id`, `kind_id`),
	CONSTRAINT `fk_inventory_category_inspections_category_id_inventory_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `inventory_categories`(`id`),
	CONSTRAINT `fk_inventory_category_inspections_kind_id_inventory_inspection_kinds_id_fk` FOREIGN KEY (`kind_id`) REFERENCES `inventory_inspection_kinds`(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_departments` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`tag_prefix` text NOT NULL,
	`next_tag_number` integer DEFAULT 1 NOT NULL,
	`lends_to` text DEFAULT 'members' NOT NULL,
	`requirements` text DEFAULT '[]' NOT NULL,
	`guidance` text,
	`contact` text,
	`department_term_id` text,
	`state` text DEFAULT 'active' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_inventory_departments_department_term_id_core_terms_id_fk` FOREIGN KEY (`department_term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "inventory_departments_name_length" CHECK(length("name") BETWEEN 1 AND 60),
	CONSTRAINT "inventory_departments_prefix_shape" CHECK("tag_prefix" GLOB '[A-Z]*' AND length("tag_prefix") BETWEEN 1 AND 4 AND "tag_prefix" NOT GLOB '*[^A-Z]*'),
	CONSTRAINT "inventory_departments_counter" CHECK("next_tag_number" >= 1),
	CONSTRAINT "inventory_departments_lends_to" CHECK("lends_to" IN ('productions', 'members', 'anyone')),
	CONSTRAINT "inventory_departments_guidance" CHECK("guidance" IS NULL OR length("guidance") <= 2000),
	CONSTRAINT "inventory_departments_contact" CHECK("contact" IS NULL OR length("contact") <= 200),
	CONSTRAINT "inventory_departments_state" CHECK("state" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE `inventory_disposals` (
	`id` text PRIMARY KEY,
	`item_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`state` text DEFAULT 'proposed' NOT NULL,
	`method` text NOT NULL,
	`recipient` text,
	`police_reference` text,
	`value_at_disposal` integer,
	`proposed_by` text NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`done_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_inventory_disposals_item_id_inventory_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`),
	CONSTRAINT "inventory_disposals_quantity" CHECK("quantity" >= 1),
	CONSTRAINT "inventory_disposals_state" CHECK("state" IN ('proposed', 'approved', 'declined', 'done')),
	CONSTRAINT "inventory_disposals_method" CHECK("method" IN ('sold', 'donated', 'recycled', 'scrapped', 'lost', 'stolen', 'returned-to-owner')),
	CONSTRAINT "inventory_disposals_recipient" CHECK("recipient" IS NULL OR length("recipient") <= 120),
	CONSTRAINT "inventory_disposals_police" CHECK("police_reference" IS NULL OR ("method" = 'stolen' AND length("police_reference") <= 40))
);
--> statement-breakpoint
CREATE TABLE `inventory_faults` (
	`id` text PRIMARY KEY,
	`item_id` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`takes_out_of_service` integer DEFAULT true NOT NULL,
	`description` text NOT NULL,
	`source` text NOT NULL,
	`loan_id` text,
	`inspection_id` text,
	`production_id` text,
	`reported_by` text,
	`resolution` text,
	`closed_by` text,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_inventory_faults_item_id_inventory_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`),
	CONSTRAINT `fk_inventory_faults_loan_id_inventory_loans_id_fk` FOREIGN KEY (`loan_id`) REFERENCES `inventory_loans`(`id`),
	CONSTRAINT `fk_inventory_faults_inspection_id_inventory_inspections_id_fk` FOREIGN KEY (`inspection_id`) REFERENCES `inventory_inspections`(`id`),
	CONSTRAINT `fk_inventory_faults_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`),
	CONSTRAINT "inventory_faults_state" CHECK("state" IN ('open', 'repaired', 'written-off')),
	CONSTRAINT "inventory_faults_source" CHECK("source" IN ('report', 'return', 'inspection', 'show-report')),
	CONSTRAINT "inventory_faults_description" CHECK(length("description") BETWEEN 1 AND 2000),
	CONSTRAINT "inventory_faults_resolution" CHECK("resolution" IS NULL OR length("resolution") <= 1000),
	CONSTRAINT "inventory_faults_closed" CHECK(("state" = 'open') = ("closed_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `inventory_inspection_dues` (
	`item_id` text NOT NULL,
	`kind_id` text NOT NULL,
	`source` text NOT NULL,
	`applies` integer DEFAULT true NOT NULL,
	`next_due_on` text,
	`last_inspection_id` text,
	CONSTRAINT `inventory_inspection_dues_pk` PRIMARY KEY(`item_id`, `kind_id`),
	CONSTRAINT `fk_inventory_inspection_dues_item_id_inventory_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`),
	CONSTRAINT `fk_inventory_inspection_dues_kind_id_inventory_inspection_kinds_id_fk` FOREIGN KEY (`kind_id`) REFERENCES `inventory_inspection_kinds`(`id`),
	CONSTRAINT `fk_inventory_inspection_dues_last_inspection_id_inventory_inspections_id_fk` FOREIGN KEY (`last_inspection_id`) REFERENCES `inventory_inspections`(`id`),
	CONSTRAINT "inventory_inspection_dues_source" CHECK("source" IN ('category', 'item')),
	CONSTRAINT "inventory_inspection_dues_excused" CHECK("applies" = 1 OR "next_due_on" IS NULL)
);
--> statement-breakpoint
CREATE TABLE `inventory_inspection_kinds` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`interval_days` integer NOT NULL,
	`inspector_requirements` text DEFAULT '[]' NOT NULL,
	`contractor_allowed` integer DEFAULT true NOT NULL,
	`certificate` text DEFAULT 'optional' NOT NULL,
	`blocks_when_overdue` integer DEFAULT true NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "inventory_inspection_kinds_name_length" CHECK(length("name") BETWEEN 1 AND 80),
	CONSTRAINT "inventory_inspection_kinds_description" CHECK("description" IS NULL OR length("description") <= 2000),
	CONSTRAINT "inventory_inspection_kinds_interval" CHECK("interval_days" BETWEEN 1 AND 3650),
	CONSTRAINT "inventory_inspection_kinds_certificate" CHECK("certificate" IN ('none', 'optional', 'required')),
	CONSTRAINT "inventory_inspection_kinds_state" CHECK("state" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE `inventory_inspections` (
	`id` text PRIMARY KEY,
	`item_id` text NOT NULL,
	`kind_id` text NOT NULL,
	`done_on` text NOT NULL,
	`result` text NOT NULL,
	`readings` text,
	`contractor` text,
	`next_due_on` text,
	`supersedes_id` text,
	`requirement_overridden_by` text,
	`recorded_by` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_inventory_inspections_item_id_inventory_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`),
	CONSTRAINT `fk_inventory_inspections_kind_id_inventory_inspection_kinds_id_fk` FOREIGN KEY (`kind_id`) REFERENCES `inventory_inspection_kinds`(`id`),
	CONSTRAINT `fk_inventory_inspections_supersedes_id_inventory_inspections_id_fk` FOREIGN KEY (`supersedes_id`) REFERENCES `inventory_inspections`(`id`),
	CONSTRAINT "inventory_inspections_result" CHECK("result" IN ('pass', 'fail')),
	CONSTRAINT "inventory_inspections_readings" CHECK("readings" IS NULL OR length("readings") <= 500),
	CONSTRAINT "inventory_inspections_contractor" CHECK("contractor" IS NULL OR length("contractor") BETWEEN 1 AND 120),
	CONSTRAINT "inventory_inspections_fail_sets_no_date" CHECK("result" = 'pass' OR "next_due_on" IS NULL)
);
--> statement-breakpoint
CREATE TABLE `inventory_item_events` (
	`id` text PRIMARY KEY,
	`item_id` text NOT NULL,
	`kind` text NOT NULL,
	`loan_id` text,
	`inspection_id` text,
	`fault_id` text,
	`disposal_id` text,
	`from_location_id` text,
	`to_location_id` text,
	`condition` text,
	`reason` text,
	`actor` text,
	`at` integer NOT NULL,
	CONSTRAINT `fk_inventory_item_events_item_id_inventory_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`),
	CONSTRAINT `fk_inventory_item_events_loan_id_inventory_loans_id_fk` FOREIGN KEY (`loan_id`) REFERENCES `inventory_loans`(`id`),
	CONSTRAINT `fk_inventory_item_events_inspection_id_inventory_inspections_id_fk` FOREIGN KEY (`inspection_id`) REFERENCES `inventory_inspections`(`id`),
	CONSTRAINT `fk_inventory_item_events_fault_id_inventory_faults_id_fk` FOREIGN KEY (`fault_id`) REFERENCES `inventory_faults`(`id`),
	CONSTRAINT `fk_inventory_item_events_disposal_id_inventory_disposals_id_fk` FOREIGN KEY (`disposal_id`) REFERENCES `inventory_disposals`(`id`),
	CONSTRAINT `fk_inventory_item_events_from_location_id_inventory_locations_id_fk` FOREIGN KEY (`from_location_id`) REFERENCES `inventory_locations`(`id`),
	CONSTRAINT `fk_inventory_item_events_to_location_id_inventory_locations_id_fk` FOREIGN KEY (`to_location_id`) REFERENCES `inventory_locations`(`id`),
	CONSTRAINT "inventory_item_events_kind" CHECK("kind" IN ('added', 'edited', 'recategorised', 'moved', 'condition-changed', 'out-of-service', 'back-in-service', 'checked-out', 'returned', 'inspected', 'fault-reported', 'fault-closed', 'marked-missing', 'found', 'disposed')),
	CONSTRAINT "inventory_item_events_reason" CHECK("reason" IS NULL OR "reason" GLOB '[a-z]*' AND "reason" NOT GLOB '*[^a-z-]*')
);
--> statement-breakpoint
CREATE TABLE `inventory_item_tags` (
	`item_id` text NOT NULL,
	`term_id` text NOT NULL,
	CONSTRAINT `inventory_item_tags_pk` PRIMARY KEY(`item_id`, `term_id`),
	CONSTRAINT `fk_inventory_item_tags_item_id_inventory_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`),
	CONSTRAINT `fk_inventory_item_tags_term_id_core_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `core_terms`(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY,
	`category_id` text NOT NULL,
	`tag` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`tracking` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`home_location_id` text NOT NULL,
	`current_location_id` text,
	`container_id` text,
	`state` text DEFAULT 'active' NOT NULL,
	`out_of_service_reason` text,
	`condition` text DEFAULT 'good' NOT NULL,
	`lendable` integer DEFAULT true NOT NULL,
	`requirements` text DEFAULT '[]' NOT NULL,
	`make` text,
	`model` text,
	`serial_number` text,
	`acquired_on` text,
	`replacement_value` integer,
	`currency` text NOT NULL,
	`ownership` text DEFAULT 'owned' NOT NULL,
	`owner_name` text,
	`owner_company_ref` text,
	`owner_due_back_on` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_inventory_items_category_id_inventory_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `inventory_categories`(`id`),
	CONSTRAINT `fk_inventory_items_home_location_id_inventory_locations_id_fk` FOREIGN KEY (`home_location_id`) REFERENCES `inventory_locations`(`id`),
	CONSTRAINT `fk_inventory_items_current_location_id_inventory_locations_id_fk` FOREIGN KEY (`current_location_id`) REFERENCES `inventory_locations`(`id`),
	CONSTRAINT `fk_inventory_items_container_id_inventory_items_id_fk` FOREIGN KEY (`container_id`) REFERENCES `inventory_items`(`id`),
	CONSTRAINT "inventory_items_name_length" CHECK(length("name") BETWEEN 1 AND 120),
	CONSTRAINT "inventory_items_description" CHECK("description" IS NULL OR length("description") <= 4000),
	CONSTRAINT "inventory_items_tracking" CHECK("tracking" IN ('individual', 'counted')),
	CONSTRAINT "inventory_items_quantity" CHECK(("tracking" = 'individual' AND "quantity" = 1) OR ("tracking" = 'counted' AND "quantity" >= 0)),
	CONSTRAINT "inventory_items_state" CHECK("state" IN ('active', 'out-of-service', 'missing', 'disposed')),
	CONSTRAINT "inventory_items_out_of_service" CHECK(("state" = 'out-of-service') = ("out_of_service_reason" IS NOT NULL)),
	CONSTRAINT "inventory_items_condition" CHECK("condition" IN ('as-new', 'good', 'worn', 'damaged')),
	CONSTRAINT "inventory_items_not_own_container" CHECK("container_id" IS NULL OR "container_id" <> "id"),
	CONSTRAINT "inventory_items_details" CHECK(coalesce(length("make"), 0) <= 80 AND coalesce(length("model"), 0) <= 80 AND coalesce(length("serial_number"), 0) <= 80),
	CONSTRAINT "inventory_items_value" CHECK("replacement_value" IS NULL OR "replacement_value" >= 0),
	CONSTRAINT "inventory_items_ownership" CHECK("ownership" IN ('owned', 'hired-in', 'borrowed-in')),
	CONSTRAINT "inventory_items_owner" CHECK("ownership" = 'owned' OR ("owner_name" IS NOT NULL AND length("owner_name") BETWEEN 1 AND 120 AND "owner_due_back_on" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `inventory_loan_lines` (
	`id` text PRIMARY KEY,
	`loan_id` text NOT NULL,
	`item_id` text,
	`wanted` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`state` text NOT NULL,
	`with_line_id` text,
	`out_at` integer,
	`returned_at` integer,
	`out_by` text,
	`returned_by` text,
	`out_condition` text,
	`returned_condition` text,
	`returned_quantity` integer,
	`fault_id` text,
	`requirement_overridden_by` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_inventory_loan_lines_loan_id_inventory_loans_id_fk` FOREIGN KEY (`loan_id`) REFERENCES `inventory_loans`(`id`),
	CONSTRAINT `fk_inventory_loan_lines_item_id_inventory_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`),
	CONSTRAINT `fk_inventory_loan_lines_with_line_id_inventory_loan_lines_id_fk` FOREIGN KEY (`with_line_id`) REFERENCES `inventory_loan_lines`(`id`),
	CONSTRAINT `fk_inventory_loan_lines_fault_id_inventory_faults_id_fk` FOREIGN KEY (`fault_id`) REFERENCES `inventory_faults`(`id`),
	CONSTRAINT "inventory_loan_lines_state" CHECK("state" IN ('wanted', 'listed', 'promised', 'out', 'returned', 'lost', 'cancelled')),
	CONSTRAINT "inventory_loan_lines_wanted" CHECK(("state" = 'wanted' AND "item_id" IS NULL) OR ("state" <> 'wanted' AND ("item_id" IS NOT NULL OR "state" = 'cancelled'))),
	CONSTRAINT "inventory_loan_lines_wanted_text" CHECK("item_id" IS NOT NULL OR ("wanted" IS NOT NULL AND length("wanted") BETWEEN 1 AND 200)),
	CONSTRAINT "inventory_loan_lines_quantity" CHECK("quantity" >= 1),
	CONSTRAINT "inventory_loan_lines_returned" CHECK("returned_quantity" IS NULL OR "returned_quantity" BETWEEN 0 AND "quantity")
);
--> statement-breakpoint
CREATE TABLE `inventory_loans` (
	`id` text PRIMARY KEY,
	`department_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`production_id` text,
	`responsible_account_id` text,
	`borrower_name` text,
	`borrower_email` text,
	`borrower_phone` text,
	`company_ref` text,
	`purpose` text,
	`starts_at` integer NOT NULL,
	`due_back_on` text NOT NULL,
	`due_back_at` integer NOT NULL,
	`due_back_set` text DEFAULT 'by-person' NOT NULL,
	`requested_by` text,
	`decided_by` text,
	`decided_at` integer,
	`decline_note` text,
	`out_at` integer,
	`returned_at` integer,
	`cancel_reason` text,
	`last_reminded_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_inventory_loans_department_id_inventory_departments_id_fk` FOREIGN KEY (`department_id`) REFERENCES `inventory_departments`(`id`),
	CONSTRAINT `fk_inventory_loans_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`),
	CONSTRAINT "inventory_loans_kind" CHECK("kind" IN ('production', 'member', 'outside')),
	CONSTRAINT "inventory_loans_state" CHECK("state" IN ('draft', 'requested', 'approved', 'out', 'returned', 'declined', 'cancelled')),
	CONSTRAINT "inventory_loans_draft" CHECK("state" <> 'draft' OR "kind" = 'production'),
	CONSTRAINT "inventory_loans_production" CHECK(("kind" = 'production') = ("production_id" IS NOT NULL)),
	CONSTRAINT "inventory_loans_linked" CHECK("responsible_account_id" IS NOT NULL OR "borrower_email" IS NOT NULL),
	CONSTRAINT "inventory_loans_responsible_kind" CHECK("kind" = 'outside' OR "responsible_account_id" IS NOT NULL),
	CONSTRAINT "inventory_loans_name" CHECK("borrower_name" IS NULL OR length("borrower_name") <= 120),
	CONSTRAINT "inventory_loans_phone" CHECK("borrower_phone" IS NULL OR length("borrower_phone") <= 40),
	CONSTRAINT "inventory_loans_purpose" CHECK("purpose" IS NULL OR length("purpose") <= 500),
	CONSTRAINT "inventory_loans_decline_note" CHECK("decline_note" IS NULL OR length("decline_note") <= 500),
	CONSTRAINT "inventory_loans_window" CHECK("due_back_at" > "starts_at"),
	CONSTRAINT "inventory_loans_due_back_set" CHECK("due_back_set" IN ('by-person', 'from-production')),
	CONSTRAINT "inventory_loans_cancel_reason" CHECK(("state" = 'cancelled') = ("cancel_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `inventory_locations` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`parent_id` text,
	`venue_id` text,
	`space_id` text,
	`state` text DEFAULT 'active' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_inventory_locations_parent_id_inventory_locations_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `inventory_locations`(`id`),
	CONSTRAINT `fk_inventory_locations_venue_id_core_venues_id_fk` FOREIGN KEY (`venue_id`) REFERENCES `core_venues`(`id`),
	CONSTRAINT `fk_inventory_locations_space_id_core_spaces_id_fk` FOREIGN KEY (`space_id`) REFERENCES `core_spaces`(`id`),
	CONSTRAINT "inventory_locations_name_length" CHECK(length("name") BETWEEN 1 AND 60),
	CONSTRAINT "inventory_locations_not_own_parent" CHECK("parent_id" IS NULL OR "parent_id" <> "id"),
	CONSTRAINT "inventory_locations_state" CHECK("state" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_categories_name` ON `inventory_categories` (`department_id`,lower("name")) WHERE state = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_departments_name` ON `inventory_departments` (lower("name")) WHERE state = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_departments_prefix` ON `inventory_departments` (`tag_prefix`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_disposals_open` ON `inventory_disposals` (`item_id`) WHERE state IN ('proposed', 'approved');--> statement-breakpoint
CREATE INDEX `inventory_faults_item` ON `inventory_faults` (`item_id`,`state`);--> statement-breakpoint
CREATE INDEX `inventory_inspection_dues_next` ON `inventory_inspection_dues` (`next_due_on`) WHERE applies = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_inspection_kinds_name` ON `inventory_inspection_kinds` (lower("name")) WHERE state = 'active';--> statement-breakpoint
CREATE INDEX `inventory_inspections_item` ON `inventory_inspections` (`item_id`,`kind_id`,`done_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_inspections_supersedes` ON `inventory_inspections` (`supersedes_id`) WHERE supersedes_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `inventory_item_events_item` ON `inventory_item_events` (`item_id`,`at`);--> statement-breakpoint
CREATE INDEX `inventory_item_tags_term` ON `inventory_item_tags` (`term_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_tag` ON `inventory_items` (`tag`);--> statement-breakpoint
CREATE INDEX `inventory_items_category` ON `inventory_items` (`category_id`,`state`);--> statement-breakpoint
CREATE INDEX `inventory_items_home` ON `inventory_items` (`home_location_id`);--> statement-breakpoint
CREATE INDEX `inventory_items_container` ON `inventory_items` (`container_id`);--> statement-breakpoint
CREATE INDEX `inventory_items_name` ON `inventory_items` (lower("name"));--> statement-breakpoint
CREATE INDEX `inventory_loan_lines_item` ON `inventory_loan_lines` (`item_id`,`state`);--> statement-breakpoint
CREATE INDEX `inventory_loan_lines_loan` ON `inventory_loan_lines` (`loan_id`);--> statement-breakpoint
CREATE INDEX `inventory_loans_due` ON `inventory_loans` (`state`,`due_back_on`);--> statement-breakpoint
CREATE INDEX `inventory_loans_production` ON `inventory_loans` (`production_id`);--> statement-breakpoint
CREATE INDEX `inventory_loans_department` ON `inventory_loans` (`department_id`,`state`);--> statement-breakpoint
CREATE INDEX `inventory_loans_responsible` ON `inventory_loans` (`responsible_account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_locations_name` ON `inventory_locations` (coalesce("parent_id", ''),lower("name")) WHERE state = 'active';--> statement-breakpoint
CREATE INDEX `inventory_locations_parent` ON `inventory_locations` (`parent_id`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `inventory_item_events_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `inventory_item_events_append_only_delete` BEFORE DELETE ON `inventory_item_events` BEGIN SELECT RAISE(ABORT, 'append-only: inventory_item_events'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `inventory_item_events_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `inventory_item_events_append_only_update` BEFORE UPDATE ON `inventory_item_events` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`item_id` IS OLD.`item_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`loan_id` IS OLD.`loan_id` AND NEW.`inspection_id` IS OLD.`inspection_id` AND NEW.`fault_id` IS OLD.`fault_id` AND NEW.`disposal_id` IS OLD.`disposal_id` AND NEW.`from_location_id` IS OLD.`from_location_id` AND NEW.`to_location_id` IS OLD.`to_location_id` AND NEW.`condition` IS OLD.`condition` AND NEW.`reason` IS OLD.`reason` AND NEW.`actor` IS OLD.`actor` AND NEW.`at` IS OLD.`at`) BEGIN SELECT RAISE(ABORT, 'append-only: inventory_item_events'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `inventory_inspections_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `inventory_inspections_append_only_delete` BEFORE DELETE ON `inventory_inspections` BEGIN SELECT RAISE(ABORT, 'append-only: inventory_inspections'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `inventory_inspections_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `inventory_inspections_append_only_update` BEFORE UPDATE ON `inventory_inspections` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`item_id` IS OLD.`item_id` AND NEW.`kind_id` IS OLD.`kind_id` AND NEW.`done_on` IS OLD.`done_on` AND NEW.`result` IS OLD.`result` AND NEW.`readings` IS OLD.`readings` AND NEW.`contractor` IS OLD.`contractor` AND NEW.`next_due_on` IS OLD.`next_due_on` AND NEW.`supersedes_id` IS OLD.`supersedes_id` AND NEW.`requirement_overridden_by` IS OLD.`requirement_overridden_by` AND NEW.`recorded_by` IS OLD.`recorded_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: inventory_inspections'); END;

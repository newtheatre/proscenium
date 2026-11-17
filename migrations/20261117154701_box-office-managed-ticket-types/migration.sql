ALTER TABLE `box_office_order_lines` ADD `requirement_ref` text;--> statement-breakpoint
ALTER TABLE `box_office_order_lines` ADD `requirement_account_id` text;--> statement-breakpoint
ALTER TABLE `box_office_order_lines` ADD `requirement_evidence_id` text;--> statement-breakpoint
ALTER TABLE `box_office_ticket_types` ADD `managed_by` text;--> statement-breakpoint
ALTER TABLE `box_office_ticket_types` ADD `sort` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `box_office_order_lines_requirement` ON `box_office_order_lines` (`performance_id`,`ticket_type_id`) WHERE requirement_ref IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_ticket_types_managed` ON `box_office_ticket_types` (`managed_by`) WHERE managed_by IS NOT NULL;
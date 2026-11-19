CREATE TABLE `box_office_pass_covers` (
	`id` text PRIMARY KEY,
	`pass_id` text NOT NULL,
	`line_id` text NOT NULL,
	`order_id` text NOT NULL,
	`asked_on` text,
	`was_minor` integer NOT NULL,
	`credit_minor` integer DEFAULT 0 NOT NULL,
	`refund_minor` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'applied' NOT NULL,
	`by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_box_office_pass_covers_pass_id_box_office_passes_id_fk` FOREIGN KEY (`pass_id`) REFERENCES `box_office_passes`(`id`),
	CONSTRAINT `fk_box_office_pass_covers_line_id_box_office_order_lines_id_fk` FOREIGN KEY (`line_id`) REFERENCES `box_office_order_lines`(`id`),
	CONSTRAINT "box_office_pass_covers_state" CHECK("state" IN ('held', 'applied', 'lapsed', 'undone')),
	CONSTRAINT "box_office_pass_covers_money" CHECK("credit_minor" >= 0 AND "refund_minor" >= 0 AND "credit_minor" + "refund_minor" <= "was_minor")
);
--> statement-breakpoint
ALTER TABLE `box_office_passes` ADD `credit_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `box_office_pass_covers_line` ON `box_office_pass_covers` (`line_id`) WHERE state = 'applied';--> statement-breakpoint
CREATE INDEX `box_office_pass_covers_pass` ON `box_office_pass_covers` (`pass_id`,`state`);--> statement-breakpoint
CREATE INDEX `box_office_pass_covers_asked` ON `box_office_pass_covers` (`asked_on`) WHERE asked_on IS NOT NULL;
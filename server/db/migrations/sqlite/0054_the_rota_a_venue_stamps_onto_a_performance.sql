CREATE TABLE `shift_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`role` text NOT NULL,
	`count` integer NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "shift_templates_role_values" CHECK("shift_templates"."role" IN ('DUTY_MANAGER', 'DOOR', 'BAR')),
	CONSTRAINT "shift_templates_count_positive" CHECK("shift_templates"."count" > 0),
	CONSTRAINT "shift_templates_one_duty_manager" CHECK("shift_templates"."role" <> 'DUTY_MANAGER' OR "shift_templates"."count" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_templates_venue_role` ON `shift_templates` (`venue_id`,`role`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`role` text NOT NULL,
	`slot` integer NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`needs_review` integer DEFAULT false NOT NULL,
	`assigned_by` text,
	`claimed_at` integer,
	`confirmed_at` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "shifts_role_values" CHECK("shifts"."role" IN ('DUTY_MANAGER', 'DOOR', 'BAR')),
	CONSTRAINT "shifts_status_values" CHECK("shifts"."status" IN ('OPEN', 'CLAIMED', 'CONFIRMED', 'DECLINED', 'CANCELLED')),
	CONSTRAINT "shifts_slot_positive" CHECK("shifts"."slot" >= 1),
	CONSTRAINT "shifts_open_names_nobody" CHECK(
    ("shifts"."status" = 'OPEN' AND "shifts"."user_id" IS NULL)
    OR ("shifts"."status" IN ('CLAIMED', 'CONFIRMED', 'DECLINED') AND "shifts"."user_id" IS NOT NULL)
    OR "shifts"."status" = 'CANCELLED'
  )
);
--> statement-breakpoint
CREATE INDEX `shifts_performance` ON `shifts` (`performance_id`);--> statement-breakpoint
CREATE INDEX `shifts_user` ON `shifts` (`user_id`);--> statement-breakpoint
CREATE INDEX `shifts_status` ON `shifts` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `shifts_one_confirmed_duty_manager` ON `shifts` (`performance_id`) WHERE role = 'DUTY_MANAGER' AND status = 'CONFIRMED';--> statement-breakpoint
CREATE UNIQUE INDEX `shifts_performance_slot` ON `shifts` (`performance_id`,`role`,`slot`);
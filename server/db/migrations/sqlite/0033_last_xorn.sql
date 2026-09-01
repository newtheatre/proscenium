CREATE TABLE `department_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`department` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer,
	`granted_by` text,
	`granted_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`department`) REFERENCES `departments`(`code`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `department_leads_user` ON `department_leads` (`user_id`);--> statement-breakpoint
CREATE INDEX `department_leads_expires_at` ON `department_leads` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `department_leads_person` ON `department_leads` (`department`,`user_id`);--> statement-breakpoint
CREATE TABLE `departments` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `departments_is_active` ON `departments` (`is_active`);--> statement-breakpoint
CREATE TABLE `module_materials` (
	`id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `module_materials_module` ON `module_materials` (`module_id`);--> statement-breakpoint
CREATE TABLE `modules` (
	`id` text PRIMARY KEY NOT NULL,
	`department` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`notes` text,
	`delivery_mode` text DEFAULT 'IN_PERSON' NOT NULL,
	`expiry_mode` text DEFAULT 'NONE' NOT NULL,
	`expiry_months` integer,
	`allows_external` integer DEFAULT false NOT NULL,
	`external_evidence` text,
	`safety_critical` integer DEFAULT false NOT NULL,
	`signoff_required` integer DEFAULT false NOT NULL,
	`grants_trainer` integer DEFAULT false NOT NULL,
	`grants_supervisor` integer DEFAULT false NOT NULL,
	`self_registrable` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`department`) REFERENCES `departments`(`code`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "modules_kind" CHECK("modules"."kind" IN ('MODULE', 'CERTIFICATION', 'BRIEF')),
	CONSTRAINT "modules_delivery_mode" CHECK("modules"."delivery_mode" IN ('IN_PERSON', 'SELF_DIRECTED', 'HYBRID')),
	CONSTRAINT "modules_expiry_mode" CHECK("modules"."expiry_mode" IN ('NONE', 'MONTHS', 'ACADEMIC_YEAR')),
	CONSTRAINT "modules_status" CHECK("modules"."status" IN ('DRAFT', 'ACTIVE', 'RETIRED')),
	CONSTRAINT "modules_expiry_months" CHECK(("modules"."expiry_mode" = 'MONTHS') = ("modules"."expiry_months" IS NOT NULL)),
	CONSTRAINT "modules_expiry_months_cap" CHECK("modules"."expiry_months" IS NULL OR ("modules"."expiry_months" > 0 AND "modules"."expiry_months" <= 120)),
	CONSTRAINT "modules_safety_critical_mode" CHECK(NOT ("modules"."safety_critical" = 1 AND "modules"."delivery_mode" = 'SELF_DIRECTED')),
	CONSTRAINT "modules_brief_never_expires" CHECK(NOT ("modules"."kind" = 'BRIEF' AND "modules"."expiry_mode" <> 'NONE')),
	CONSTRAINT "modules_brief_grants_nothing" CHECK(NOT ("modules"."kind" = 'BRIEF' AND ("modules"."grants_trainer" = 1 OR "modules"."grants_supervisor" = 1))),
	CONSTRAINT "modules_self_registrable_brief" CHECK(NOT ("modules"."self_registrable" = 1 AND "modules"."kind" <> 'BRIEF'))
);
--> statement-breakpoint
CREATE INDEX `modules_department` ON `modules` (`department`);--> statement-breakpoint
CREATE INDEX `modules_status` ON `modules` (`status`);
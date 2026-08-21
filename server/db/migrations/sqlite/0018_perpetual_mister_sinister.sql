CREATE TABLE `foh_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`phone` text NOT NULL,
	`kind` text DEFAULT 'OTHER' NOT NULL,
	`note` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `foh_contacts_sort_idx` ON `foh_contacts` (`sort`);--> statement-breakpoint
CREATE TABLE `incident_log` (
	`id` text PRIMARY KEY NOT NULL,
	`performance_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`body` text NOT NULL,
	`supersedes_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `incident_log_performance_idx` ON `incident_log` (`performance_id`);--> statement-breakpoint
CREATE INDEX `incident_log_created_at_idx` ON `incident_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `venue_emergency_info` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`address_for_emergency_call` text,
	`what3words` text,
	`evacuation_procedure` text,
	`assembly_point` text,
	`first_aid_location` text,
	`defibrillator_location` text,
	`isolation_points` text,
	`fire_panel_location` text,
	`updated_by_user_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venue_emergency_info_venue_unique` ON `venue_emergency_info` (`venue_id`);
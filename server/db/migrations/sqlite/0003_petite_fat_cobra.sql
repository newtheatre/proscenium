CREATE TABLE `venue_features` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venue_features_name_unique` ON `venue_features` (`name`);--> statement-breakpoint
CREATE INDEX `venue_features_name_idx` ON `venue_features` (`name`);--> statement-breakpoint
CREATE INDEX `venue_features_is_active_idx` ON `venue_features` (`is_active`);--> statement-breakpoint
CREATE TABLE `venues` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`capacity` integer,
	`image_url` text,
	`description` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venues_name_unique` ON `venues` (`name`);--> statement-breakpoint
CREATE INDEX `venues_name_idx` ON `venues` (`name`);--> statement-breakpoint
CREATE INDEX `venues_is_active_idx` ON `venues` (`is_active`);--> statement-breakpoint
CREATE TABLE `venues_to_features` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`feature_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`feature_id`) REFERENCES `venue_features`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `venues_to_features_venue_id_idx` ON `venues_to_features` (`venue_id`);--> statement-breakpoint
CREATE INDEX `venues_to_features_feature_id_idx` ON `venues_to_features` (`feature_id`);
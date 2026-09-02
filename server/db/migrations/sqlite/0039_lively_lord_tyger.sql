CREATE TABLE `session_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`module_id` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `training_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `session_modules_module` ON `session_modules` (`module_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_modules_pair` ON `session_modules` (`session_id`,`module_id`);--> statement-breakpoint
CREATE TABLE `training_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`held_on` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`place` text,
	`capacity` integer NOT NULL,
	`opens_at` integer,
	`status` text DEFAULT 'PLANNED' NOT NULL,
	`notes` text,
	`trainer_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`trainer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "training_sessions_status" CHECK("training_sessions"."status" IN ('PLANNED', 'OPEN', 'FULL', 'DELIVERED', 'CANCELLED')),
	CONSTRAINT "training_sessions_capacity" CHECK("training_sessions"."capacity" BETWEEN 1 AND 60),
	CONSTRAINT "training_sessions_span" CHECK("training_sessions"."ends_at" > "training_sessions"."starts_at")
);
--> statement-breakpoint
CREATE INDEX `training_sessions_held_on` ON `training_sessions` (`held_on`);--> statement-breakpoint
CREATE INDEX `training_sessions_status` ON `training_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `training_sessions_trainer` ON `training_sessions` (`trainer_id`);
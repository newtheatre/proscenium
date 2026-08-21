CREATE TABLE `bar_session_performances` (
	`session_id` text NOT NULL,
	`performance_id` text NOT NULL,
	PRIMARY KEY(`session_id`, `performance_id`),
	FOREIGN KEY (`session_id`) REFERENCES `bar_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`performance_id`) REFERENCES `performances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bar_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`night` text NOT NULL,
	`venue` text,
	`opened_at` integer NOT NULL,
	`opened_by_user_id` text NOT NULL,
	`closed_at` integer,
	`closed_by_user_id` text,
	`closing_note` text,
	`checklist` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`opened_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`closed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bar_sessions_open_unique` ON `bar_sessions` (`night`,`venue`) WHERE closed_at is null;--> statement-breakpoint
CREATE INDEX `bar_sessions_night_idx` ON `bar_sessions` (`night`);--> statement-breakpoint
CREATE TABLE `day_reconciliations` (
	`day` text PRIMARY KEY NOT NULL,
	`sumup_z_pence` integer NOT NULL,
	`entered_by_user_id` text NOT NULL,
	`entered_at` integer NOT NULL,
	`note` text,
	FOREIGN KEY (`entered_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);

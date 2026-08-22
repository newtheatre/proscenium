PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bar_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`night` text NOT NULL,
	`venue` text DEFAULT '' NOT NULL,
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
INSERT INTO `__new_bar_sessions`("id", "night", "venue", "opened_at", "opened_by_user_id", "closed_at", "closed_by_user_id", "closing_note", "checklist", "created_at") SELECT "id", "night", "venue", "opened_at", "opened_by_user_id", "closed_at", "closed_by_user_id", "closing_note", "checklist", "created_at" FROM `bar_sessions`;--> statement-breakpoint
DROP TABLE `bar_sessions`;--> statement-breakpoint
ALTER TABLE `__new_bar_sessions` RENAME TO `bar_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `bar_sessions_open_unique` ON `bar_sessions` (`night`,`venue`) WHERE closed_at is null;--> statement-breakpoint
CREATE INDEX `bar_sessions_night_idx` ON `bar_sessions` (`night`);
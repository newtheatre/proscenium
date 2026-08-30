PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`starts_on` text NOT NULL,
	`expires_on` text NOT NULL,
	`source` text NOT NULL,
	`evidence` text,
	`granted_by` text,
	`confirmed_at` integer,
	`confirmed_by` text,
	`renewal_notice_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "memberships_source" CHECK("__new_memberships"."source" IN ('MANUAL', 'ROSTER')),
	CONSTRAINT "memberships_term" CHECK("__new_memberships"."expires_on" > "__new_memberships"."starts_on")
);
--> statement-breakpoint
INSERT INTO `__new_memberships`("id", "user_id", "starts_on", "expires_on", "source", "evidence", "granted_by", "confirmed_at", "confirmed_by", "renewal_notice_at", "created_at") SELECT "id", "user_id", "starts_on", "expires_on", "source", "evidence", "granted_by", "confirmed_at", "confirmed_by", "renewal_notice_at", "created_at" FROM `memberships`;--> statement-breakpoint
DROP TABLE `memberships`;--> statement-breakpoint
ALTER TABLE `__new_memberships` RENAME TO `memberships`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `memberships_user` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE INDEX `memberships_expires_on` ON `memberships` (`expires_on`);
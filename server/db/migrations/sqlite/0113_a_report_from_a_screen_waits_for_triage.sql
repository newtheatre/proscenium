CREATE TABLE `feedback_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`page_path` text NOT NULL,
	`shell` text NOT NULL,
	`user_agent` text,
	`recent_failures` text,
	`status` text DEFAULT 'NEW' NOT NULL,
	`issue_url` text,
	`triaged_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "feedback_reports_kind_values" CHECK("feedback_reports"."kind" IN ('BUG', 'IDEA')),
	CONSTRAINT "feedback_reports_shell_values" CHECK("feedback_reports"."shell" IN ('console', 'tonight')),
	CONSTRAINT "feedback_reports_status_values" CHECK("feedback_reports"."status" IN ('NEW', 'TRIAGED', 'DONE', 'DISMISSED')),
	CONSTRAINT "feedback_reports_triage_is_whole" CHECK(("feedback_reports"."status" = 'NEW') = ("feedback_reports"."issue_url" IS NULL AND "feedback_reports"."triaged_at" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `feedback_reports_status` ON `feedback_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_reports_reporter` ON `feedback_reports` (`reporter_id`);
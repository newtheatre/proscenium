CREATE TABLE `core_access_profiles` (
	`account_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`payload` text,
	`pending` text,
	`message` text,
	`submitted_at` integer NOT NULL,
	`submitted_via` text NOT NULL,
	`submitted_by` text,
	`decided_at` integer,
	`decided_by` text,
	`verified_at` integer,
	`verified_by` text,
	`verified_method` text,
	`verified_companions` integer,
	`review_due` integer,
	`reminders` integer DEFAULT 0 NOT NULL,
	`flagged_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT "core_access_profiles_payload_when_accepted" CHECK((status = 'accepted') = (payload IS NOT NULL)),
	CONSTRAINT "core_access_profiles_verified_when_accepted" CHECK(verified_at IS NULL OR status = 'accepted')
);
--> statement-breakpoint
CREATE TABLE `core_access_shares` (
	`account_id` text NOT NULL,
	`purpose` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `core_access_shares_pk` PRIMARY KEY(`account_id`, `purpose`)
);

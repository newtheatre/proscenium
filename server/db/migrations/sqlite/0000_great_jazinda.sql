CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target` text,
	`detail` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_actor` ON `audit_log` (`actor_id`);--> statement-breakpoint
CREATE INDEX `audit_log_action` ON `audit_log` (`action`);--> statement-breakpoint
CREATE INDEX `audit_log_target` ON `audit_log` (`target`);--> statement-breakpoint
CREATE INDEX `audit_log_created_at` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`token_hash` text NOT NULL,
	`email` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "auth_tokens_kind" CHECK("auth_tokens"."kind" IN ('EMAIL_VERIFY', 'PASSWORD_RESET', 'MAGIC_LINK', 'SET_PASSWORD'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_token_hash_unique` ON `auth_tokens` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_user_kind` ON `auth_tokens` (`user_id`,`kind`);--> statement-breakpoint
CREATE TABLE `emergency_contacts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`relation` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`year` integer NOT NULL,
	`source` text NOT NULL,
	`evidence` text,
	`granted_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "memberships_source" CHECK("memberships"."source" IN ('MANUAL', 'ROSTER'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_user_year` ON `memberships` (`user_id`,`year`);--> statement-breakpoint
CREATE TABLE `passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`credential_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text,
	`backed_up` integer DEFAULT false NOT NULL,
	`label` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passkeys_credential_id_unique` ON `passkeys` (`credential_id`);--> statement-breakpoint
CREATE TABLE `recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recovery_codes_user` ON `recovery_codes` (`user_id`);--> statement-breakpoint
CREATE TABLE `role_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`expires_at` integer,
	`granted_by` text,
	`granted_at` integer DEFAULT (unixepoch()) NOT NULL,
	`note` text,
	`expiry_warned_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `role_grants_expires_at` ON `role_grants` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `role_grants_user_role` ON `role_grants` (`user_id`,`role`);--> statement-breakpoint
CREATE TABLE `totp_secrets` (
	`user_id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`confirmed_at` integer,
	`last_used_step` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`pronouns` text,
	`password` text,
	`google_sub` text,
	`pending_google_email` text,
	`verified` integer DEFAULT false NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`session_epoch` integer DEFAULT 0 NOT NULL,
	`anonymised_at` integer,
	`last_login_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "users_email_lowercase" CHECK("users"."email" = lower("users"."email")),
	CONSTRAINT "users_no_workspace_password" CHECK("users"."password" IS NULL OR "users"."email" NOT LIKE '%@newtheatre.org.uk')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_pending_google_email_unique` ON `users` (`pending_google_email`);
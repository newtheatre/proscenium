CREATE TABLE `access_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`companions` integer DEFAULT 0 NOT NULL,
	`encrypted_payload` text,
	`encryption_iv` text,
	`consent_foh_at` integer,
	`verified_by` text,
	`verified_at` integer,
	`expires_at` integer,
	`withdrawn_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "access_profiles_status_values" CHECK("access_profiles"."status" IN ('PENDING', 'VERIFIED', 'EXPIRED', 'DECLINED', 'WITHDRAWN')),
	CONSTRAINT "access_profiles_companions_range" CHECK("access_profiles"."companions" BETWEEN 0 AND 2),
	CONSTRAINT "access_profiles_payload_pair" CHECK(("access_profiles"."encrypted_payload" IS NULL) = ("access_profiles"."encryption_iv" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `access_profiles_status` ON `access_profiles` (`status`);--> statement-breakpoint
CREATE INDEX `access_profiles_withdrawn_at` ON `access_profiles` (`withdrawn_at`);
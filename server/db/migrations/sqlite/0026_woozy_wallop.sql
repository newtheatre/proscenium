CREATE TABLE `rota_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`auto_confirm_claims` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL
);

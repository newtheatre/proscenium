CREATE TABLE `forms_templates` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`definition` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);

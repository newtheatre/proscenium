CREATE TABLE `module_prerequisites` (
	`id` text PRIMARY KEY NOT NULL,
	`module_id` text NOT NULL,
	`requires_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`module_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requires_id`) REFERENCES `modules`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "module_prerequisites_not_self" CHECK("module_prerequisites"."module_id" <> "module_prerequisites"."requires_id")
);
--> statement-breakpoint
CREATE INDEX `module_prerequisites_requires` ON `module_prerequisites` (`requires_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `module_prerequisites_edge` ON `module_prerequisites` (`module_id`,`requires_id`);
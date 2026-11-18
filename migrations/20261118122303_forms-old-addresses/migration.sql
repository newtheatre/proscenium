CREATE TABLE `forms_old_addresses` (
	`slug` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_forms_old_addresses_form_id_forms_forms_id_fk` FOREIGN KEY (`form_id`) REFERENCES `forms_forms`(`id`)
);
--> statement-breakpoint
CREATE INDEX `forms_old_addresses_form` ON `forms_old_addresses` (`form_id`);
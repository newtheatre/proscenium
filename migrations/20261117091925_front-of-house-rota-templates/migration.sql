CREATE TABLE `front_of_house_rota_template_lines` (
	`template_id` text NOT NULL,
	`duty_id` text NOT NULL,
	`places` integer NOT NULL,
	CONSTRAINT `front_of_house_rota_template_lines_pk` PRIMARY KEY(`template_id`, `duty_id`),
	CONSTRAINT `fk_front_of_house_rota_template_lines_template_id_front_of_house_rota_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `front_of_house_rota_templates`(`id`),
	CONSTRAINT `fk_front_of_house_rota_template_lines_duty_id_front_of_house_duties_id_fk` FOREIGN KEY (`duty_id`) REFERENCES `front_of_house_duties`(`id`),
	CONSTRAINT "front_of_house_rota_template_lines_places" CHECK("places" BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_rota_templates` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`venue_id` text,
	`is_default` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "front_of_house_rota_templates_name_length" CHECK(length("name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_rota_templates_name` ON `front_of_house_rota_templates` (`name`) WHERE archived_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_rota_templates_default` ON `front_of_house_rota_templates` (coalesce("venue_id", '')) WHERE is_default = 1 AND archived_at IS NULL;
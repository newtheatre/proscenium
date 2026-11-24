CREATE TABLE `front_of_house_shift_batches` (
	`id` text PRIMARY KEY,
	`crew_call_id` text,
	`template_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`space_id` text,
	`title` text NOT NULL,
	`days` text NOT NULL,
	`call_time` text NOT NULL,
	`end_time` text NOT NULL,
	`made` integer NOT NULL,
	`state` text DEFAULT 'made' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_shift_batches_crew_call_id_front_of_house_crew_calls_id_fk` FOREIGN KEY (`crew_call_id`) REFERENCES `front_of_house_crew_calls`(`id`),
	CONSTRAINT `fk_front_of_house_shift_batches_template_id_front_of_house_rota_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `front_of_house_rota_templates`(`id`),
	CONSTRAINT "front_of_house_shift_batches_title" CHECK(length("title") BETWEEN 1 AND 80),
	CONSTRAINT "front_of_house_shift_batches_days" CHECK(json_array_length("days") BETWEEN 1 AND 31),
	CONSTRAINT "front_of_house_shift_batches_times" CHECK("call_time" GLOB '[0-2][0-9]:[0-5][0-9]' AND "end_time" GLOB '[0-2][0-9]:[0-5][0-9]'),
	CONSTRAINT "front_of_house_shift_batches_made" CHECK("made" >= 0),
	CONSTRAINT "front_of_house_shift_batches_state" CHECK("state" IN ('made', 'removed'))
);
--> statement-breakpoint
ALTER TABLE `front_of_house_shifts` ADD `batch_id` text REFERENCES front_of_house_shift_batches(id);--> statement-breakpoint
CREATE INDEX `front_of_house_shift_batches_call` ON `front_of_house_shift_batches` (`crew_call_id`);--> statement-breakpoint
CREATE INDEX `front_of_house_shifts_batch` ON `front_of_house_shifts` (`batch_id`);--> statement-breakpoint
CREATE INDEX `front_of_house_shifts_calendar` ON `front_of_house_shifts` (`call_at`,`venue_id`);
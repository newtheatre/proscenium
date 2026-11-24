CREATE TABLE `front_of_house_crew_calls` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`season_id` text,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`question_roles` text DEFAULT '{}' NOT NULL,
	`tshirt_min_shifts` integer,
	`meal_min_minutes` integer,
	`meals_on_request` integer DEFAULT true NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "front_of_house_crew_calls_name_length" CHECK(length("name") BETWEEN 1 AND 80),
	CONSTRAINT "front_of_house_crew_calls_dates" CHECK("ends_on" >= "starts_on"),
	CONSTRAINT "front_of_house_crew_calls_tshirt" CHECK("tshirt_min_shifts" IS NULL OR "tshirt_min_shifts" BETWEEN 1 AND 50),
	CONSTRAINT "front_of_house_crew_calls_meal" CHECK("meal_min_minutes" IS NULL OR "meal_min_minutes" BETWEEN 30 AND 720),
	CONSTRAINT "front_of_house_crew_calls_state" CHECK("state" IN ('draft', 'open', 'closed', 'archived'))
);
--> statement-breakpoint
ALTER TABLE `front_of_house_shifts` ADD `space_id` text;--> statement-breakpoint
ALTER TABLE `front_of_house_shifts` ADD `crew_call_id` text REFERENCES front_of_house_crew_calls(id);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_crew_calls_name` ON `front_of_house_crew_calls` (`name`) WHERE state <> 'archived';--> statement-breakpoint
CREATE INDEX `front_of_house_crew_calls_season` ON `front_of_house_crew_calls` (`season_id`,`state`);--> statement-breakpoint
CREATE INDEX `front_of_house_shifts_crew_call` ON `front_of_house_shifts` (`crew_call_id`,`call_at`);
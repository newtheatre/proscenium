CREATE TABLE `front_of_house_handouts` (
	`id` text PRIMARY KEY,
	`crew_call_id` text NOT NULL,
	`account_id` text NOT NULL,
	`item` text NOT NULL,
	`day` text,
	`size` text,
	`reverses_id` text,
	`handed_by` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_handouts_crew_call_id_front_of_house_crew_calls_id_fk` FOREIGN KEY (`crew_call_id`) REFERENCES `front_of_house_crew_calls`(`id`),
	CONSTRAINT `fk_front_of_house_handouts_reverses_id_front_of_house_handouts_id_fk` FOREIGN KEY (`reverses_id`) REFERENCES `front_of_house_handouts`(`id`),
	CONSTRAINT "front_of_house_handouts_item" CHECK("item" IN ('tshirt', 'meal')),
	CONSTRAINT "front_of_house_handouts_day" CHECK(("item" = 'meal') = ("day" IS NOT NULL)),
	CONSTRAINT "front_of_house_handouts_size" CHECK("size" IS NULL OR length("size") <= 20)
);
--> statement-breakpoint
CREATE INDEX `front_of_house_handouts_call` ON `front_of_house_handouts` (`crew_call_id`,`account_id`,`item`,`day`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_handouts_reverses` ON `front_of_house_handouts` (`reverses_id`) WHERE reverses_id IS NOT NULL;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `front_of_house_handouts_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `front_of_house_handouts_append_only_delete` BEFORE DELETE ON `front_of_house_handouts` BEGIN SELECT RAISE(ABORT, 'append-only: front_of_house_handouts'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `front_of_house_handouts_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `front_of_house_handouts_append_only_update` BEFORE UPDATE ON `front_of_house_handouts` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`crew_call_id` IS OLD.`crew_call_id` AND NEW.`account_id` IS OLD.`account_id` AND NEW.`item` IS OLD.`item` AND NEW.`day` IS OLD.`day` AND (NEW.`size` IS OLD.`size` OR NEW.`size` IS NULL) AND NEW.`reverses_id` IS OLD.`reverses_id` AND NEW.`handed_by` IS OLD.`handed_by` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: front_of_house_handouts'); END;

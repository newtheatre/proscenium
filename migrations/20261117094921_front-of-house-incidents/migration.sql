CREATE TABLE `front_of_house_incident_actions` (
	`id` text PRIMARY KEY,
	`incident_id` text NOT NULL,
	`what` text NOT NULL,
	`owner_id` text,
	`due_on` text,
	`state` text DEFAULT 'open' NOT NULL,
	`resolved_at` integer,
	`resolved_note` text,
	`chased_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_incident_actions_incident_id_front_of_house_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `front_of_house_incidents`(`id`),
	CONSTRAINT "front_of_house_incident_actions_what" CHECK(length("what") BETWEEN 1 AND 300),
	CONSTRAINT "front_of_house_incident_actions_state" CHECK("state" IN ('open', 'done', 'dropped')),
	CONSTRAINT "front_of_house_incident_actions_note" CHECK("resolved_note" IS NULL OR length("resolved_note") <= 300),
	CONSTRAINT "front_of_house_incident_actions_dropped" CHECK("state" <> 'dropped' OR "resolved_note" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_incident_people` (
	`id` text PRIMARY KEY,
	`incident_id` text NOT NULL,
	`account_id` text,
	`name` text,
	`contact` text,
	`involvement` text NOT NULL,
	`is_child` integer DEFAULT false NOT NULL,
	`details` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_incident_people_incident_id_front_of_house_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `front_of_house_incidents`(`id`),
	CONSTRAINT "front_of_house_incident_people_who" CHECK("account_id" IS NOT NULL OR "name" IS NOT NULL),
	CONSTRAINT "front_of_house_incident_people_name" CHECK("name" IS NULL OR length("name") <= 120),
	CONSTRAINT "front_of_house_incident_people_contact" CHECK("contact" IS NULL OR length("contact") <= 200),
	CONSTRAINT "front_of_house_incident_people_involvement" CHECK("involvement" IN ('affected', 'witness', 'helped', 'other'))
);
--> statement-breakpoint
CREATE TABLE `front_of_house_incident_updates` (
	`id` text PRIMARY KEY,
	`incident_id` text NOT NULL,
	`kind` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`body` text,
	`author_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_incident_updates_incident_id_front_of_house_incidents_id_fk` FOREIGN KEY (`incident_id`) REFERENCES `front_of_house_incidents`(`id`),
	CONSTRAINT "front_of_house_incident_updates_kind" CHECK("kind" IN ('comment', 'state', 'severity', 'category')),
	CONSTRAINT "front_of_house_incident_updates_body" CHECK("body" IS NULL OR length("body") <= 2000)
);
--> statement-breakpoint
CREATE TABLE `front_of_house_incidents` (
	`id` text PRIMARY KEY,
	`number` integer NOT NULL,
	`year` integer NOT NULL,
	`kind` text NOT NULL,
	`category_id` text,
	`severity` text DEFAULT 'minor' NOT NULL,
	`state` text DEFAULT 'reported' NOT NULL,
	`performance_id` text,
	`venue_id` text,
	`space_id` text,
	`where_note` text,
	`occurred_at` integer NOT NULL,
	`what_happened` text NOT NULL,
	`immediate_action` text,
	`first_aid_given` integer DEFAULT false NOT NULL,
	`emergency_services_called` integer DEFAULT false NOT NULL,
	`reported_by` text NOT NULL,
	`reported_at` integer NOT NULL,
	`reviewer_id` text,
	`closed_by` text,
	`closed_at` integer,
	`closing_note` text,
	`digested_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_front_of_house_incidents_category_id_core_terms_id_fk` FOREIGN KEY (`category_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "front_of_house_incidents_kind" CHECK("kind" IN ('incident', 'near_miss')),
	CONSTRAINT "front_of_house_incidents_severity" CHECK("severity" IN ('minor', 'moderate', 'serious')),
	CONSTRAINT "front_of_house_incidents_state" CHECK("state" IN ('reported', 'in_review', 'closed')),
	CONSTRAINT "front_of_house_incidents_floor" CHECK("severity" <> 'minor' OR ("first_aid_given" = 0 AND "emergency_services_called" = 0)),
	CONSTRAINT "front_of_house_incidents_where" CHECK("where_note" IS NULL OR length("where_note") <= 120),
	CONSTRAINT "front_of_house_incidents_what" CHECK(length("what_happened") BETWEEN 1 AND 4000),
	CONSTRAINT "front_of_house_incidents_action" CHECK("immediate_action" IS NULL OR length("immediate_action") <= 2000),
	CONSTRAINT "front_of_house_incidents_closing" CHECK("closing_note" IS NULL OR length("closing_note") <= 2000),
	CONSTRAINT "front_of_house_incidents_closed" CHECK("state" <> 'closed' OR ("closed_at" IS NOT NULL AND "closing_note" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `front_of_house_incident_actions_incident` ON `front_of_house_incident_actions` (`incident_id`);--> statement-breakpoint
CREATE INDEX `front_of_house_incident_actions_due` ON `front_of_house_incident_actions` (`state`,`due_on`);--> statement-breakpoint
CREATE INDEX `front_of_house_incident_people_incident` ON `front_of_house_incident_people` (`incident_id`);--> statement-breakpoint
CREATE INDEX `front_of_house_incident_people_account` ON `front_of_house_incident_people` (`account_id`) WHERE account_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `front_of_house_incident_updates_incident` ON `front_of_house_incident_updates` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `front_of_house_incidents_number` ON `front_of_house_incidents` (`year`,`number`);--> statement-breakpoint
CREATE INDEX `front_of_house_incidents_state` ON `front_of_house_incidents` (`state`,`reported_at`);--> statement-breakpoint
CREATE INDEX `front_of_house_incidents_reporter` ON `front_of_house_incidents` (`reported_by`);
--> statement-breakpoint
DROP TRIGGER IF EXISTS `front_of_house_incident_updates_append_only_delete`;
--> statement-breakpoint
CREATE TRIGGER `front_of_house_incident_updates_append_only_delete` BEFORE DELETE ON `front_of_house_incident_updates` BEGIN SELECT RAISE(ABORT, 'append-only: front_of_house_incident_updates'); END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `front_of_house_incident_updates_append_only_update`;
--> statement-breakpoint
CREATE TRIGGER `front_of_house_incident_updates_append_only_update` BEFORE UPDATE ON `front_of_house_incident_updates` WHEN NOT (NEW.`id` IS OLD.`id` AND NEW.`incident_id` IS OLD.`incident_id` AND NEW.`kind` IS OLD.`kind` AND NEW.`from_value` IS OLD.`from_value` AND NEW.`to_value` IS OLD.`to_value` AND (NEW.`body` IS OLD.`body` OR NEW.`body` IS NULL) AND NEW.`author_id` IS OLD.`author_id` AND NEW.`created_at` IS OLD.`created_at`) BEGIN SELECT RAISE(ABORT, 'append-only: front_of_house_incident_updates'); END;

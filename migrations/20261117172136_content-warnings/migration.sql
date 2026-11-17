CREATE TABLE `core_production_effects` (
	`production_id` text NOT NULL,
	`term_id` text NOT NULL,
	`detail` text,
	CONSTRAINT `core_production_effects_pk` PRIMARY KEY(`production_id`, `term_id`),
	CONSTRAINT `fk_core_production_effects_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_production_effects_term_id_core_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "core_production_effects_detail" CHECK("detail" IS NULL OR length("detail") <= 300)
);
--> statement-breakpoint
CREATE TABLE `core_term_groups` (
	`id` text PRIMARY KEY,
	`vocabulary_key` text NOT NULL,
	`label` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_core_term_groups_vocabulary_key_core_vocabularies_key_fk` FOREIGN KEY (`vocabulary_key`) REFERENCES `core_vocabularies`(`key`) ON DELETE RESTRICT,
	CONSTRAINT "core_term_groups_label_length" CHECK(length("label") BETWEEN 1 AND 80)
);
--> statement-breakpoint
-- core_productions is the parent of many tables, so it is never rebuilt: dropping it inside D1's transaction would fail on (or cascade through) its children. The new columns are added in place, with their checks on the columns, and the old age_guidance column stays unused (nothing reads or writes it).
ALTER TABLE `core_productions` ADD `age_min` integer CONSTRAINT `core_productions_age_min` CHECK(`age_min` IS NULL OR `age_min` BETWEEN 0 AND 21);--> statement-breakpoint
ALTER TABLE `core_productions` ADD `age_restricted` integer DEFAULT false NOT NULL CONSTRAINT `core_productions_age_restricted` CHECK(`age_restricted` = 0 OR `age_min` IS NOT NULL);--> statement-breakpoint
ALTER TABLE `core_productions` ADD `effects_confirmed_none` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `core_terms` ADD `group_id` text REFERENCES core_term_groups(id) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE `core_vocabularies` ADD `grouped` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Carrying existing rows across (content warnings slice). Staging effects move out of the advisory vocabulary: the terms keep their ids, so every row that points at one still does.
INSERT INTO `core_vocabularies` (`key`, `owner`, `label`, `description`, `ordering`, `locked`, `term_class`, `grouped`) SELECT 'core.staging-effect', `owner`, 'Staging effects', 'What the room does to the audience: always shown on a production''s page, because it is safety information.', 'manual', 0, 'public', 0 FROM `core_vocabularies` WHERE `key` = 'core.advisory';--> statement-breakpoint
UPDATE `core_terms` SET `vocabulary_key` = 'core.staging-effect' WHERE `vocabulary_key` = 'core.advisory' AND `slug` IN ('strobe', 'haze', 'loud-noise', 'gunshots') AND EXISTS (SELECT 1 FROM `core_vocabularies` WHERE `key` = 'core.staging-effect');--> statement-breakpoint
INSERT INTO `core_production_effects` (`production_id`, `term_id`, `detail`) SELECT a.`production_id`, a.`term_id`, a.`detail` FROM `core_production_advisories` a JOIN `core_terms` t ON t.`id` = a.`term_id` WHERE t.`vocabulary_key` = 'core.staging-effect';--> statement-breakpoint
DELETE FROM `core_production_advisories` WHERE `term_id` IN (SELECT `id` FROM `core_terms` WHERE `vocabulary_key` = 'core.staging-effect');--> statement-breakpoint
-- Age: text that is a number ("12+", "14 and over") becomes a recommendation; any other text is kept by appending it to the content note.
UPDATE `core_productions` SET `content_note` = CASE WHEN `content_note` IS NULL OR `content_note` = '' THEN `age_guidance` ELSE `content_note` || char(10) || char(10) || `age_guidance` END WHERE `age_guidance` IS NOT NULL AND trim(`age_guidance`) <> '' AND (NOT (lower(trim(`age_guidance`)) GLOB '[0-9]' OR lower(trim(`age_guidance`)) GLOB '[0-9][0-9]' OR lower(trim(`age_guidance`)) GLOB '[0-9]+' OR lower(trim(`age_guidance`)) GLOB '[0-9][0-9]+' OR lower(trim(`age_guidance`)) GLOB '[0-9] and over' OR lower(trim(`age_guidance`)) GLOB '[0-9][0-9] and over') OR CAST(trim(`age_guidance`) AS integer) > 21);--> statement-breakpoint
UPDATE `core_productions` SET `age_min` = CAST(trim(`age_guidance`) AS integer) WHERE `age_guidance` IS NOT NULL AND (lower(trim(`age_guidance`)) GLOB '[0-9]' OR lower(trim(`age_guidance`)) GLOB '[0-9][0-9]' OR lower(trim(`age_guidance`)) GLOB '[0-9]+' OR lower(trim(`age_guidance`)) GLOB '[0-9][0-9]+' OR lower(trim(`age_guidance`)) GLOB '[0-9] and over' OR lower(trim(`age_guidance`)) GLOB '[0-9][0-9] and over') AND CAST(trim(`age_guidance`) AS integer) <= 21;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_core_production_advisories` (
	`production_id` text NOT NULL,
	`term_id` text NOT NULL,
	`level` text NOT NULL,
	`level_assumed` integer DEFAULT false NOT NULL,
	`detail` text,
	CONSTRAINT `core_production_advisories_pk` PRIMARY KEY(`production_id`, `term_id`),
	CONSTRAINT `fk_core_production_advisories_production_id_core_productions_id_fk` FOREIGN KEY (`production_id`) REFERENCES `core_productions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_core_production_advisories_term_id_core_terms_id_fk` FOREIGN KEY (`term_id`) REFERENCES `core_terms`(`id`),
	CONSTRAINT "core_production_advisories_detail" CHECK("detail" IS NULL OR length("detail") <= 300),
	CONSTRAINT "core_production_advisories_level" CHECK("level" IN ('mentioned', 'discussed', 'depicted'))
);
--> statement-breakpoint
-- A warning written before levels existed is given the most serious level, so nothing is understated, and marked assumed until a person grades it.
INSERT INTO `__new_core_production_advisories`(`production_id`, `term_id`, `level`, `level_assumed`, `detail`) SELECT `production_id`, `term_id`, 'depicted', 1, `detail` FROM `core_production_advisories`;--> statement-breakpoint
DROP TABLE `core_production_advisories`;--> statement-breakpoint
ALTER TABLE `__new_core_production_advisories` RENAME TO `core_production_advisories`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `core_term_groups_label` ON `core_term_groups` (`vocabulary_key`,lower("label"));--> statement-breakpoint
CREATE INDEX `core_term_groups_order` ON `core_term_groups` (`vocabulary_key`,`sort`);--> statement-breakpoint
CREATE INDEX `core_terms_group` ON `core_terms` (`group_id`);
ALTER TABLE `forms_responses` ADD `score` integer;--> statement-breakpoint
ALTER TABLE `forms_responses` ADD `out_of` integer;--> statement-breakpoint
ALTER TABLE `forms_responses` ADD `passed` integer;--> statement-breakpoint
-- Marking a form is a separate ability, held at first by whoever may already edit forms.
INSERT OR IGNORE INTO `core_role_abilities` (`role_id`, `ability`) SELECT DISTINCT `role_id`, 'forms.form.mark' FROM `core_role_abilities` WHERE `ability` IN ('forms.form.edit', 'forms.form.publish');--> statement-breakpoint
INSERT OR IGNORE INTO `core_fact_abilities` (`fact`, `ability`, `pinned_record`, `created_by`, `created_at`) SELECT `fact`, 'forms.form.mark', `pinned_record`, `created_by`, `created_at` FROM `core_fact_abilities` WHERE `ability` IN ('forms.form.edit', 'forms.form.publish');

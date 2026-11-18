ALTER TABLE `core_productions` ADD `usual_space_id` text REFERENCES core_spaces(id) ON DELETE SET NULL;

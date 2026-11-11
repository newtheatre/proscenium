-- A pass type admits once to each performance, as every one did, or once to each show (0262).
ALTER TABLE `pass_types` ADD `admission_rule` text DEFAULT 'PER_PERFORMANCE' NOT NULL;

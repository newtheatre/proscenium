ALTER TABLE `core_access_profiles` ADD `options_seen_at` integer;--> statement-breakpoint
-- The access scheme asks what would help rather than what is hard: the seeded entries a theatre has not renamed take the new words.
UPDATE `core_vocabularies` SET `description` = 'What would help a person at a visit, which they tick when they apply to the access scheme. Help, never diagnoses.'
WHERE `key` = 'core.access-need' AND `description` = 'The barriers a person can tick when they apply to the access scheme. Barriers, never diagnoses.';--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'No queueing, and a seat while you wait', `description` = 'We let you in without queueing and find you somewhere to sit.'
WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'standing' AND `label` = 'Standing or queueing';--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'A calmer way in', `description` = 'Go in before the crowds, and have somewhere quiet to take a break.'
WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'crowds' AND `label` = 'Crowds and busy spaces';--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'A step-free route', `description` = 'A level way in, and a seat you can reach without steps or stairs.'
WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'level-access' AND `label` = 'Steps and stairs';--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'A short walk to your seat', `description` = 'A seat close to the entrance.'
WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'distance' AND `label` = 'Walking distances';--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'An aisle seat near an exit', `description` = 'So you can step out and back easily, for example to use a toilet.'
WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'urgent-toilet' AND `label` = 'Getting to a toilet quickly';--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'Captions, and things written down', `description` = 'Captioned performances, and anything we would tell you aloud given to you in writing.'
WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'visual-information' AND `label` = 'Hearing what is said';--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'Audio description, and things read out', `description` = 'Audio-described performances and touch tours, and anything written read out to you.'
WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'audible-information' AND `label` = 'Seeing or reading information';

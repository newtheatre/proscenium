-- Plainer wording for the access scheme's seeded needs (core.access-need). Only a term the theatre
-- has not renamed is changed, and a description is added only where there is none.
UPDATE `core_terms` SET `label` = 'Standing or queueing' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'standing' AND `seeded` = 1 AND `label` = 'Difficulty standing or queueing';
--> statement-breakpoint
UPDATE `core_terms` SET `description` = 'You find it hard to stand for long or wait in a queue.' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'standing' AND `seeded` = 1 AND `description` IS NULL;
--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'Crowds and busy spaces' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'crowds' AND `seeded` = 1 AND `label` = 'Difficulty with crowds';
--> statement-breakpoint
UPDATE `core_terms` SET `description` = 'You find crowds, noise or busy foyers hard to cope with.' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'crowds' AND `seeded` = 1 AND `description` IS NULL;
--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'Steps and stairs' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'level-access' AND `seeded` = 1 AND `label` = 'Level access';
--> statement-breakpoint
UPDATE `core_terms` SET `description` = 'You cannot use steps or stairs, so you need a ramp, a lift or a level route.' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'level-access' AND `seeded` = 1 AND `description` IS NULL;
--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'Walking distances' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'distance' AND `seeded` = 1 AND `label` = 'Difficulty with distance';
--> statement-breakpoint
UPDATE `core_terms` SET `description` = 'You can only walk a short way, so a seat near the entrance helps.' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'distance' AND `seeded` = 1 AND `description` IS NULL;
--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'Getting to a toilet quickly' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'urgent-toilet' AND `seeded` = 1 AND `label` = 'Urgent toilet needs';
--> statement-breakpoint
UPDATE `core_terms` SET `description` = 'You may need to leave at short notice, so a seat near the door and a toilet helps.' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'urgent-toilet' AND `seeded` = 1 AND `description` IS NULL;
--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'Hearing what is said' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'visual-information' AND `seeded` = 1 AND `label` = 'Visual information';
--> statement-breakpoint
UPDATE `core_terms` SET `description` = 'You need spoken information shown or written down, for example captions or a written note.' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'visual-information' AND `seeded` = 1 AND `description` IS NULL;
--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'Seeing or reading information' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'audible-information' AND `seeded` = 1 AND `label` = 'Audible information';
--> statement-breakpoint
UPDATE `core_terms` SET `description` = 'You need written or visual information read out or described, for example audio description.' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'audible-information' AND `seeded` = 1 AND `description` IS NULL;
--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'Needs a companion to help' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'essential-companion' AND `seeded` = 1 AND `label` = 'An essential companion';
--> statement-breakpoint
UPDATE `core_terms` SET `description` = 'Set when the person asks for a companion ticket.' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'essential-companion' AND `seeded` = 1 AND `description` IS NULL;
--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'Something else (see their note)' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'other' AND `seeded` = 1 AND `label` = 'Other (please ask)';
--> statement-breakpoint
UPDATE `core_terms` SET `description` = 'Set when the person writes something in "anything else".' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'other' AND `seeded` = 1 AND `description` IS NULL;
--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'Wheelchair user, stays in their wheelchair' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'wheelchair-stays' AND `seeded` = 1 AND `label` = 'Uses a wheelchair and stays in it';
--> statement-breakpoint
UPDATE `core_terms` SET `description` = 'They need a wheelchair space.' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'wheelchair-stays' AND `seeded` = 1 AND `description` IS NULL;
--> statement-breakpoint
UPDATE `core_terms` SET `label` = 'Wheelchair user, transfers to a seat' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'wheelchair-transfers' AND `seeded` = 1 AND `label` = 'Uses a wheelchair and transfers to a seat';
--> statement-breakpoint
UPDATE `core_terms` SET `description` = 'They move to an ordinary seat, and their wheelchair needs storing.' WHERE `vocabulary_key` = 'core.access-need' AND `slug` = 'wheelchair-transfers' AND `seeded` = 1 AND `description` IS NULL;

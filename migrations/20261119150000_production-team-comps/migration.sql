-- A site made before "Production team" was a reason for complimentary tickets gains it after Crew, unless it has one already.
UPDATE `core_terms` SET `sort` = `sort` + 1
WHERE `vocabulary_key` = 'box-office.comp-reason'
	AND `sort` > coalesce((SELECT `sort` FROM `core_terms` WHERE `vocabulary_key` = 'box-office.comp-reason' AND `slug` = 'crew'), (SELECT max(`sort`) FROM `core_terms` WHERE `vocabulary_key` = 'box-office.comp-reason'))
	AND NOT EXISTS (SELECT 1 FROM `core_terms` WHERE `vocabulary_key` = 'box-office.comp-reason' AND (`slug` = 'production-team' OR (lower(`label`) = 'production team' AND `retired_at` IS NULL)));--> statement-breakpoint
INSERT OR IGNORE INTO `core_terms` (`id`, `vocabulary_key`, `slug`, `label`, `sort`, `seeded`, `created_at`)
SELECT 'trm_23obu76zckgun335pubhqkuk5c', `key`, 'production-team', 'Production team',
	coalesce((SELECT `sort` FROM `core_terms` WHERE `vocabulary_key` = 'box-office.comp-reason' AND `slug` = 'crew'), (SELECT max(`sort`) FROM `core_terms` WHERE `vocabulary_key` = 'box-office.comp-reason'), -1) + 1,
	1, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM `core_vocabularies` WHERE `key` = 'box-office.comp-reason';

ALTER TABLE `backstage_milestone_types` ADD `side` text;--> statement-breakpoint
ALTER TABLE `backstage_presets` ADD `side` text;--> statement-breakpoint
-- Each seeded call on the end whose wording it carries (issue 1313): front of house opens the
-- house and says when it is ready to restart; the wings call the rest of the show.
UPDATE backstage_milestone_types SET side = 'FOH' WHERE label = 'House open' COLLATE NOCASE;
--> statement-breakpoint
UPDATE backstage_milestone_types SET side = 'BACKSTAGE' WHERE side IS NULL;
--> statement-breakpoint
INSERT INTO backstage_milestone_types (id, label, sort, side)
SELECT lower(hex(randomblob(16))), 'Ready to restart', 4, 'FOH'
WHERE NOT EXISTS (SELECT 1 FROM backstage_milestone_types WHERE label = 'Ready to restart' COLLATE NOCASE);
--> statement-breakpoint
-- 0119's four presets, read by what each says: the foyer holds, clears and stands the show by;
-- the wings tell the duty manager an ambulance is coming. Anything else stays for the committee.
UPDATE backstage_presets SET side = 'FOH' WHERE label IN ('Standby', 'Hold', 'Clear') COLLATE NOCASE;
--> statement-breakpoint
UPDATE backstage_presets SET side = 'BACKSTAGE' WHERE label = 'Ambulance' COLLATE NOCASE;

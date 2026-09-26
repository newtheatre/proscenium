-- Every venue we run gains the two system-verified items a close needs (E-114 criterion 3, issue
-- 1318). A venue already holding one, live or retired, keeps its own; each addition is audited.
INSERT INTO audit_log (id, actor_id, action, target, detail)
SELECT lower(hex(randomblob(16))), NULL, 'checklist-item.created', 'venue:' || v.id,
       json_object('phase', 'POST', 'label', 'Unpaid holds released')
FROM venues v
WHERE v.is_external = 0 AND v.archived = 0
  AND NOT EXISTS (SELECT 1 FROM checklist_items ci WHERE ci.venue_id = v.id AND ci.system_check = 'NO_SHOW_HOLDS_RELEASED');
--> statement-breakpoint
INSERT INTO checklist_items (id, venue_id, phase, label, sort, required, system_check)
SELECT lower(hex(randomblob(16))), v.id, 'POST', 'Unpaid holds released',
       (SELECT coalesce(max(held.sort) + 1, 0) FROM checklist_items held WHERE held.venue_id = v.id), 1, 'NO_SHOW_HOLDS_RELEASED'
FROM venues v
WHERE v.is_external = 0 AND v.archived = 0
  AND NOT EXISTS (SELECT 1 FROM checklist_items ci WHERE ci.venue_id = v.id AND ci.system_check = 'NO_SHOW_HOLDS_RELEASED');
--> statement-breakpoint
INSERT INTO audit_log (id, actor_id, action, target, detail)
SELECT lower(hex(randomblob(16))), NULL, 'checklist-item.created', 'venue:' || v.id,
       json_object('phase', 'POST', 'label', 'Tonight''s incidents reviewed')
FROM venues v
WHERE v.is_external = 0 AND v.archived = 0
  AND NOT EXISTS (SELECT 1 FROM checklist_items ci WHERE ci.venue_id = v.id AND ci.system_check = 'INCIDENTS_REVIEWED');
--> statement-breakpoint
INSERT INTO checklist_items (id, venue_id, phase, label, sort, required, system_check)
SELECT lower(hex(randomblob(16))), v.id, 'POST', 'Tonight''s incidents reviewed',
       (SELECT coalesce(max(held.sort) + 1, 0) FROM checklist_items held WHERE held.venue_id = v.id), 1, 'INCIDENTS_REVIEWED'
FROM venues v
WHERE v.is_external = 0 AND v.archived = 0
  AND NOT EXISTS (SELECT 1 FROM checklist_items ci WHERE ci.venue_id = v.id AND ci.system_check = 'INCIDENTS_REVIEWED');
--> statement-breakpoint
-- The board's four routine calls for its first night (E-121 criterion 2), seeded unaudited as
-- 0079's milestones were. A call the committee already has, in any case, is left as it is.
INSERT INTO backstage_presets (id, label, body, sort)
SELECT lower(hex(randomblob(16))), 'Standby', 'Standby please.', (SELECT coalesce(max(sort) + 1, 0) FROM backstage_presets)
WHERE NOT EXISTS (SELECT 1 FROM backstage_presets WHERE label = 'Standby' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO backstage_presets (id, label, body, sort)
SELECT lower(hex(randomblob(16))), 'Hold', 'Hold the show, front of house are dealing with something.', (SELECT coalesce(max(sort) + 1, 0) FROM backstage_presets)
WHERE NOT EXISTS (SELECT 1 FROM backstage_presets WHERE label = 'Hold' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO backstage_presets (id, label, body, sort)
SELECT lower(hex(randomblob(16))), 'Clear', 'Clear to continue.', (SELECT coalesce(max(sort) + 1, 0) FROM backstage_presets)
WHERE NOT EXISTS (SELECT 1 FROM backstage_presets WHERE label = 'Clear' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO backstage_presets (id, label, body, sort)
SELECT lower(hex(randomblob(16))), 'Ambulance', 'An ambulance has been called. Duty manager to the foyer.', (SELECT coalesce(max(sort) + 1, 0) FROM backstage_presets)
WHERE NOT EXISTS (SELECT 1 FROM backstage_presets WHERE label = 'Ambulance' COLLATE NOCASE);

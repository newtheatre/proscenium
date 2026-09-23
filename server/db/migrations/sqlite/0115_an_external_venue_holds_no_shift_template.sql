-- An external venue is staffed ad hoc and holds no shift template (E-101 criterion 5, issue 1210).
-- Marking one external now clears its template; this clears those marked before that rule. Each
-- removal is audited as the venue edit would audit it, naming slots and no person (0011); there is
-- no actor, since no person made it. `shift_templates` is not an append-only table (0010).
INSERT INTO audit_log (id, actor_id, action, target, detail)
SELECT lower(hex(randomblob(16))), NULL, 'shift-template.removed', 'venue:' || v.id,
       json_object('slots', (
         SELECT group_concat(slot, ', ')
         FROM (SELECT role || ':' || "count" AS slot FROM shift_templates WHERE venue_id = v.id ORDER BY role)
       ), 'reason', 'external')
FROM venues v
WHERE v.is_external = 1 AND EXISTS (SELECT 1 FROM shift_templates t WHERE t.venue_id = v.id);
--> statement-breakpoint
DELETE FROM shift_templates
WHERE venue_id IN (SELECT id FROM venues WHERE is_external = 1);

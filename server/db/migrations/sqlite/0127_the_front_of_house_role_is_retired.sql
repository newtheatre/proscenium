-- FRONT_OF_HOUSE granted nothing and nothing read it, so it leaves the vocabulary (A-134, #1211
-- point 7). Its grants are removed, never folded into a role that would hand out power; nobody
-- loses access. role_grants is not append-only, so this deletes in place in one transaction.
-- Audited first, while each grant still reads as it stood: no actor, no note, no free text (0011).
INSERT INTO audit_log (id, actor_id, action, target, detail)
SELECT
  lower(hex(randomblob(16))),
  NULL,
  'role.retired',
  'user:' || user_id,
  json_object(
    'role', 'FRONT_OF_HOUSE',
    'expiresAt', expires_at,
    'permanent', json(CASE WHEN expires_at IS NULL THEN 'true' ELSE 'false' END)
  )
FROM role_grants
WHERE role = 'FRONT_OF_HOUSE';
--> statement-breakpoint
DELETE FROM role_grants WHERE role = 'FRONT_OF_HOUSE';

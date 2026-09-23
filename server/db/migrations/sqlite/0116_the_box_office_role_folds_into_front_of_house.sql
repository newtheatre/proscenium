-- The Box Office Manager is the Front of House Manager, so BOX_OFFICE folds into FOH_MANAGER (0090,
-- A-133). role_grants is not append-only (renewed, revoked and pruned in place), so this updates in
-- place; D1 runs the file as one transaction, so no holder is ever between the two roles.
-- Audited first, while each grant still reads as it stood: no actor, no note, no free text (0011).
INSERT INTO audit_log (id, actor_id, action, target, detail)
SELECT
  lower(hex(randomblob(16))),
  NULL,
  'role.merged',
  'user:' || box.user_id,
  json_object(
    'from', 'BOX_OFFICE',
    'role', 'FOH_MANAGER',
    'expiresAt', CASE
      WHEN foh.id IS NULL THEN box.expires_at
      WHEN box.expires_at IS NULL OR foh.expires_at IS NULL THEN NULL
      ELSE max(box.expires_at, foh.expires_at)
    END,
    'permanent', json(CASE
      WHEN box.expires_at IS NULL OR (foh.id IS NOT NULL AND foh.expires_at IS NULL) THEN 'true'
      ELSE 'false'
    END)
  )
FROM role_grants box
LEFT JOIN role_grants foh ON foh.user_id = box.user_id AND foh.role = 'FOH_MANAGER'
WHERE box.role = 'BOX_OFFICE';
--> statement-breakpoint
-- A holder of both keeps the later expiry, permanent beating any date; a moved expiry re-arms the
-- lapse warning, as a renewal does (A-119 criterion 1).
UPDATE role_grants
SET
  expires_at = (
    SELECT box.expires_at FROM role_grants box
    WHERE box.user_id = role_grants.user_id AND box.role = 'BOX_OFFICE'
  ),
  expiry_warned_at = NULL
WHERE role = 'FOH_MANAGER'
  AND expires_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM role_grants box
    WHERE box.user_id = role_grants.user_id
      AND box.role = 'BOX_OFFICE'
      AND (box.expires_at IS NULL OR box.expires_at > role_grants.expires_at)
  );
--> statement-breakpoint
-- Nobody else holds front of house, so the grant is renamed with its expiry, granter and note.
UPDATE role_grants
SET role = 'FOH_MANAGER'
WHERE role = 'BOX_OFFICE'
  AND NOT EXISTS (
    SELECT 1 FROM role_grants foh
    WHERE foh.user_id = role_grants.user_id AND foh.role = 'FOH_MANAGER'
  );
--> statement-breakpoint
-- Every row left was folded into its holder's front of house grant above.
DELETE FROM role_grants WHERE role = 'BOX_OFFICE';

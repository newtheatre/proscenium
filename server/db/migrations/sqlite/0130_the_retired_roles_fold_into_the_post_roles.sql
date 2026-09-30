-- A committee post holds one role (0113, A-135): the bar folds into front of house, safety and
-- training into the Theatre Manager, accessibility becomes the Secretary's, and MANAGER retires.
-- role_grants is not append-only, so this updates in place; D1 runs the file as one transaction.
-- Guard first: a live retired grant whose holder holds neither the live post role nor an IT Manager
-- grant lasting as long is decided by hand (0070). The NULL user_id fails, so nothing is written.
WITH successor(retired, post) AS (
  VALUES ('BAR_MANAGER', 'FOH_MANAGER'), ('SAFETY_OFFICER', 'THEATRE_MANAGER'), ('TRAINING_MANAGER', 'THEATRE_MANAGER'), ('MANAGER', NULL)
)
INSERT INTO role_grants (id, user_id, role)
SELECT 'a-retired-grant-needs-deciding-by-hand', NULL, 'REFUSED'
FROM role_grants g
JOIN successor s ON s.retired = g.role
WHERE (g.expires_at IS NULL OR g.expires_at > unixepoch())
  AND NOT EXISTS (
    SELECT 1 FROM role_grants p
    WHERE p.user_id = g.user_id AND p.role = s.post AND (p.expires_at IS NULL OR p.expires_at > unixepoch())
  )
  AND NOT EXISTS (
    SELECT 1 FROM role_grants a
    WHERE a.user_id = g.user_id AND a.role = 'ADMIN'
      AND (a.expires_at IS NULL OR (g.expires_at IS NOT NULL AND a.expires_at >= g.expires_at))
  )
LIMIT 1;
--> statement-breakpoint
-- A lapsed retired grant gives nothing, so it is removed, not folded. Audited as 0127 did (0011).
INSERT INTO audit_log (id, actor_id, action, target, detail)
SELECT
  lower(hex(randomblob(16))),
  NULL,
  'role.retired',
  'user:' || user_id,
  json_object('role', role, 'expiresAt', expires_at, 'permanent', json('false'))
FROM role_grants
WHERE role IN ('MANAGER', 'BAR_MANAGER', 'SAFETY_OFFICER', 'TRAINING_MANAGER', 'ACCESSIBILITY_OFFICER')
  AND expires_at IS NOT NULL AND expires_at <= unixepoch();
--> statement-breakpoint
-- Each live retired grant, audited while it still reads as it stood: the role it lands on and the
-- expiry that role then carries. A post role beats the IT Manager's as the target.
WITH successor(retired, post) AS (
  VALUES ('BAR_MANAGER', 'FOH_MANAGER'), ('SAFETY_OFFICER', 'THEATRE_MANAGER'), ('TRAINING_MANAGER', 'THEATRE_MANAGER'), ('ACCESSIBILITY_OFFICER', 'SECRETARY'), ('MANAGER', NULL)
),
moving AS (
  SELECT
    g.user_id,
    g.role AS retired,
    s.post,
    g.expires_at,
    (
      SELECT p.id FROM role_grants p
      WHERE p.user_id = g.user_id AND p.role = s.post
        AND (p.expires_at IS NULL OR p.expires_at > unixepoch() OR p.role = 'SECRETARY')
    ) AS post_id
  FROM role_grants g
  JOIN successor s ON s.retired = g.role
  WHERE g.expires_at IS NULL OR g.expires_at > unixepoch()
),
landing AS (
  SELECT
    m.user_id,
    m.retired,
    CASE WHEN m.post_id IS NOT NULL OR m.retired = 'ACCESSIBILITY_OFFICER' THEN m.post ELSE 'ADMIN' END AS role,
    CASE
      WHEN m.post_id IS NOT NULL THEN CASE
        WHEN (SELECT expires_at FROM role_grants WHERE id = m.post_id) IS NULL
          OR EXISTS (SELECT 1 FROM moving o WHERE o.user_id = m.user_id AND o.post = m.post AND o.expires_at IS NULL)
          THEN NULL
        ELSE max(
          (SELECT expires_at FROM role_grants WHERE id = m.post_id),
          (SELECT max(o.expires_at) FROM moving o WHERE o.user_id = m.user_id AND o.post = m.post)
        )
      END
      WHEN m.retired = 'ACCESSIBILITY_OFFICER' THEN m.expires_at
      ELSE (SELECT a.expires_at FROM role_grants a WHERE a.user_id = m.user_id AND a.role = 'ADMIN')
    END AS expires_at
  FROM moving m
)
INSERT INTO audit_log (id, actor_id, action, target, detail)
SELECT
  lower(hex(randomblob(16))),
  NULL,
  'role.merged',
  'user:' || user_id,
  json_object(
    'from', retired,
    'role', role,
    'expiresAt', expires_at,
    'permanent', json(CASE WHEN expires_at IS NULL THEN 'true' ELSE 'false' END)
  )
FROM landing;
--> statement-breakpoint
DELETE FROM role_grants
WHERE role IN ('MANAGER', 'BAR_MANAGER', 'SAFETY_OFFICER', 'TRAINING_MANAGER', 'ACCESSIBILITY_OFFICER')
  AND expires_at IS NOT NULL AND expires_at <= unixepoch();
--> statement-breakpoint
-- The post grant takes the later expiry, permanent beating any date, and a moved expiry re-arms
-- the lapse warning (A-119 criterion 1). A lapsed Secretary grant is renewed by the one it replaces.
WITH successor(retired, post) AS (
  VALUES ('BAR_MANAGER', 'FOH_MANAGER'), ('SAFETY_OFFICER', 'THEATRE_MANAGER'), ('TRAINING_MANAGER', 'THEATRE_MANAGER'), ('ACCESSIBILITY_OFFICER', 'SECRETARY')
)
UPDATE role_grants
SET expires_at = NULL, expiry_warned_at = NULL
WHERE expires_at IS NOT NULL
  AND (expires_at > unixepoch() OR role = 'SECRETARY')
  AND EXISTS (
    SELECT 1 FROM role_grants g JOIN successor s ON s.retired = g.role
    WHERE g.user_id = role_grants.user_id AND s.post = role_grants.role AND g.expires_at IS NULL
  );
--> statement-breakpoint
WITH successor(retired, post) AS (
  VALUES ('BAR_MANAGER', 'FOH_MANAGER'), ('SAFETY_OFFICER', 'THEATRE_MANAGER'), ('TRAINING_MANAGER', 'THEATRE_MANAGER'), ('ACCESSIBILITY_OFFICER', 'SECRETARY')
)
UPDATE role_grants
SET
  expires_at = (
    SELECT max(g.expires_at) FROM role_grants g JOIN successor s ON s.retired = g.role
    WHERE g.user_id = role_grants.user_id AND s.post = role_grants.role
  ),
  expiry_warned_at = NULL
WHERE expires_at IS NOT NULL
  AND (expires_at > unixepoch() OR role = 'SECRETARY')
  AND (
    SELECT max(g.expires_at) FROM role_grants g JOIN successor s ON s.retired = g.role
    WHERE g.user_id = role_grants.user_id AND s.post = role_grants.role
  ) > expires_at;
--> statement-breakpoint
-- The Secretary's role replaces the accessibility role one for one, so a lone grant is renamed
-- with its expiry, granter and note, as 0116 renamed a lone box office grant.
UPDATE role_grants
SET role = 'SECRETARY'
WHERE role = 'ACCESSIBILITY_OFFICER'
  AND NOT EXISTS (
    SELECT 1 FROM role_grants p WHERE p.user_id = role_grants.user_id AND p.role = 'SECRETARY'
  );
--> statement-breakpoint
-- Every row left was folded into a post grant or is covered by the IT Manager's, as the guard held.
DELETE FROM role_grants
WHERE role IN ('MANAGER', 'BAR_MANAGER', 'SAFETY_OFFICER', 'TRAINING_MANAGER', 'ACCESSIBILITY_OFFICER');
--> statement-breakpoint
-- A post role carries the Committee's standing, so a Committee grant it outlasts is removed. One
-- beside the IT Manager's alone stays: the function is not a post (0113).
INSERT INTO audit_log (id, actor_id, action, target, detail)
SELECT
  lower(hex(randomblob(16))),
  NULL,
  'role.merged',
  'user:' || c.user_id,
  json_object(
    'from', 'COMMITTEE',
    'role', p.role,
    'expiresAt', p.expires_at,
    'permanent', json(CASE WHEN p.expires_at IS NULL THEN 'true' ELSE 'false' END)
  )
FROM role_grants c
JOIN role_grants p ON p.id = (
  SELECT q.id FROM role_grants q
  WHERE q.user_id = c.user_id
    AND q.role IN ('PRESIDENT', 'SECRETARY', 'TREASURER', 'FOH_MANAGER', 'THEATRE_MANAGER')
    AND (q.expires_at IS NULL OR (c.expires_at IS NOT NULL AND q.expires_at >= c.expires_at))
  ORDER BY q.expires_at IS NULL DESC, q.expires_at DESC, q.role
  LIMIT 1
)
WHERE c.role = 'COMMITTEE';
--> statement-breakpoint
DELETE FROM role_grants
WHERE role = 'COMMITTEE'
  AND EXISTS (
    SELECT 1 FROM role_grants q
    WHERE q.user_id = role_grants.user_id
      AND q.role IN ('PRESIDENT', 'SECRETARY', 'TREASURER', 'FOH_MANAGER', 'THEATRE_MANAGER')
      AND (q.expires_at IS NULL OR (role_grants.expires_at IS NOT NULL AND q.expires_at >= role_grants.expires_at))
  );
--> statement-breakpoint
-- A stored role list is read as written, so a retired name would silently end what it named. Each
-- becomes its successor, never just dropped; the second-factor list also keeps its whole floor.
WITH successor(retired, role) AS (
  VALUES ('BAR_MANAGER', 'FOH_MANAGER'), ('SAFETY_OFFICER', 'THEATRE_MANAGER'), ('TRAINING_MANAGER', 'THEATRE_MANAGER'), ('ACCESSIBILITY_OFFICER', 'SECRETARY'), ('MANAGER', NULL), ('FRONT_OF_HOUSE', NULL), ('BOX_OFFICE', 'FOH_MANAGER')
),
privileged_floor(role, ord) AS (
  VALUES ('ADMIN', 1000), ('PRESIDENT', 1001), ('SECRETARY', 1002), ('TREASURER', 1003), ('FOH_MANAGER', 1004), ('THEATRE_MANAGER', 1005)
),
listed AS (
  SELECT c.key, CASE WHEN s.retired IS NULL THEN e.value ELSE s.role END AS role, e.key AS ord
  FROM config c
  JOIN json_each(c.value) e
  LEFT JOIN successor s ON s.retired = e.value
  WHERE c.key IN ('BAR_AUTHORISED_TAB_ROLES', 'NIGHT_REPORT_ROLES', 'PRIVILEGED_ROLES')
  UNION ALL
  SELECT c.key, f.role, f.ord FROM config c JOIN privileged_floor f WHERE c.key = 'PRIVILEGED_ROLES'
),
kept AS (
  SELECT key, role, min(ord) AS ord FROM listed WHERE role IS NOT NULL GROUP BY key, role
),
gathered AS (
  SELECT key, json_group_array(role) AS value FROM (SELECT key, role FROM kept ORDER BY key, ord) GROUP BY key
),
rewritten AS (
  SELECT c.key, c.value AS was, coalesce(g.value, '[]') AS value
  FROM config c
  LEFT JOIN gathered g ON g.key = c.key
  WHERE c.key IN ('BAR_AUTHORISED_TAB_ROLES', 'NIGHT_REPORT_ROLES', 'PRIVILEGED_ROLES')
)
INSERT INTO audit_log (id, actor_id, action, target, detail)
SELECT
  lower(hex(randomblob(16))),
  NULL,
  'config.changed',
  'config:' || key,
  json_object('key', key, 'changes', json_object('value', json_object('from', json(was), 'to', json(value))))
FROM rewritten
WHERE value IS NOT was;
--> statement-breakpoint
WITH successor(retired, role) AS (
  VALUES ('BAR_MANAGER', 'FOH_MANAGER'), ('SAFETY_OFFICER', 'THEATRE_MANAGER'), ('TRAINING_MANAGER', 'THEATRE_MANAGER'), ('ACCESSIBILITY_OFFICER', 'SECRETARY'), ('MANAGER', NULL), ('FRONT_OF_HOUSE', NULL), ('BOX_OFFICE', 'FOH_MANAGER')
),
privileged_floor(role, ord) AS (
  VALUES ('ADMIN', 1000), ('PRESIDENT', 1001), ('SECRETARY', 1002), ('TREASURER', 1003), ('FOH_MANAGER', 1004), ('THEATRE_MANAGER', 1005)
),
listed AS (
  SELECT c.key, CASE WHEN s.retired IS NULL THEN e.value ELSE s.role END AS role, e.key AS ord
  FROM config c
  JOIN json_each(c.value) e
  LEFT JOIN successor s ON s.retired = e.value
  WHERE c.key IN ('BAR_AUTHORISED_TAB_ROLES', 'NIGHT_REPORT_ROLES', 'PRIVILEGED_ROLES')
  UNION ALL
  SELECT c.key, f.role, f.ord FROM config c JOIN privileged_floor f WHERE c.key = 'PRIVILEGED_ROLES'
),
kept AS (
  SELECT key, role, min(ord) AS ord FROM listed WHERE role IS NOT NULL GROUP BY key, role
),
gathered AS (
  SELECT key, json_group_array(role) AS value FROM (SELECT key, role FROM kept ORDER BY key, ord) GROUP BY key
)
UPDATE config
SET value = coalesce((SELECT g.value FROM gathered g WHERE g.key = config.key), '[]'), updated_by = NULL, updated_at = unixepoch()
WHERE key IN ('BAR_AUTHORISED_TAB_ROLES', 'NIGHT_REPORT_ROLES', 'PRIVILEGED_ROLES')
  AND value IS NOT coalesce((SELECT g.value FROM gathered g WHERE g.key = config.key), '[]');

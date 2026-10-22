-- An erasure now lapses every live grant in its own batch (0150). Accounts erased before that kept
-- theirs live on the tombstone; this lapses them the same way, the grant and its history kept.
UPDATE role_grants SET expires_at = unixepoch()
WHERE (expires_at IS NULL OR expires_at > unixepoch())
  AND user_id IN (SELECT id FROM users WHERE anonymised_at IS NOT NULL);

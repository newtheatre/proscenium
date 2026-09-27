import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

// A-119 criterion 4. The trail is written from the delete's own predicate, one row per grant,
// before the delete in one batch: both read the same rows, and neither binds an id (0049, 0006).
export function pruneLapsedStatements(cutoff: number): { audit: SQL, prune: SQL } {
  const lapsed = sql`expires_at IS NOT NULL AND expires_at <= ${cutoff}`
  return {
    audit: sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT lower(hex(randomblob(16))), NULL, 'role.pruned', 'user:' || user_id,
             json_object('role', role, 'expiresAt', expires_at)
      FROM role_grants WHERE ${lapsed}
    `,
    prune: sql`DELETE FROM role_grants WHERE ${lapsed} RETURNING id`,
  }
}

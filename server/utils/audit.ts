import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { AuditRow } from '#shared/utils/audit'

// Both halves of 0049's pattern in one call: the write batched with its own conditional audit
// insert, answered as whether it applied. The refusal and its wording stay with the caller.
export async function auditedWrite(write: BatchItem<'sqlite'>, entry: AuditRow): Promise<boolean> {
  const [rows] = await db.batch([
    write,
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${entry.detail !== null ? JSON.stringify(entry.detail) : null}
      WHERE changes() = 1
    `),
  ])
  return Array.isArray(rows) && rows.length > 0
}

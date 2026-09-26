import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { SQL } from 'drizzle-orm'
import type { AuditRow } from '#shared/utils/audit'

// Both halves of 0049's pattern in one call: the write batched with its own conditional audit
// insert, answered as whether it applied. The refusal and its wording stay with the caller.

// The entry, written only if the statement batched just before it changed one row.
export function auditIfChanged(entry: AuditRow): SQL {
  return sql`
    INSERT INTO audit_log (id, actor_id, action, target, detail)
    SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${entry.detail !== null ? JSON.stringify(entry.detail) : null}
    WHERE changes() = 1
  `
}

// `then` is what the write cascades to, batched after the insert that reads `changes()`.
export async function auditedWrite(write: BatchItem<'sqlite'>, entry: AuditRow, ...then: BatchItem<'sqlite'>[]): Promise<boolean> {
  const [rows] = await db.batch([write, db.run(auditIfChanged(entry)), ...then])
  return Array.isArray(rows) && rows.length > 0
}

import { sql } from 'drizzle-orm'
import { auditEntry } from '#shared/utils/audit'
import type { AuditDetail } from '#shared/utils/audit'
import type { SyncFailed, SyncFailure } from '#shared/utils/bank-holidays'
import type { SQL } from 'drizzle-orm'

// The bank holiday sync's writes and reads as pure statements, so the integration suite runs the
// same SQL the task does (C-121 criteria 7 and 8, 0091). The task itself is bank-holidays.ts.

const KEY = 'BANK_HOLIDAYS'

// No actor on either statement: the dates are gov.uk's, not whoever asked for the run (0091). The
// audit row is conditional on the stored value, so two overlapping runs audit one change once (0003).
export function listChangeStatements(dates: readonly string[], change: AuditDetail, nowSeconds: number): SQL[] {
  const value = JSON.stringify(dates)
  const entry = auditEntry({ actorId: null, action: 'config.changed', target: `config:${KEY}`, detail: change })

  return [
    sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail, created_at)
      SELECT ${entry.id}, NULL, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}, ${nowSeconds}
      WHERE (SELECT value FROM config WHERE key = ${KEY}) IS NOT ${value}
    `,
    sql`
      INSERT INTO config (key, value, updated_by, updated_at) VALUES (${KEY}, ${value}, NULL, ${nowSeconds})
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = NULL, updated_at = excluded.updated_at
    `,
  ]
}

export function syncedStatement(actorId: string | null, dates: readonly string[], nowSeconds: number): SQL {
  const entry = auditEntry({
    actorId,
    action: 'bank-holidays.synced',
    detail: { dates: dates.length, coveredTo: [...dates].sort().at(-1) ?? null },
  })
  return auditInsert(entry.id, actorId, entry.action, entry.detail, nowSeconds)
}

// A word from a fixed vocabulary and a status code, never a response body (0011).
export function syncFailedStatement(actorId: string | null, failed: SyncFailed, nowSeconds: number): SQL {
  const detail: AuditDetail = failed.status === undefined ? { failure: failed.failure } : { failure: failed.failure, status: failed.status }
  const entry = auditEntry({ actorId, action: 'bank-holidays.sync-failed', detail })
  return auditInsert(entry.id, actorId, entry.action, entry.detail, nowSeconds)
}

function auditInsert(id: string, actorId: string | null, action: string, detail: AuditDetail | null, nowSeconds: number): SQL {
  return sql`
    INSERT INTO audit_log (id, actor_id, action, target, detail, created_at)
    VALUES (${id}, ${actorId}, ${action}, NULL, ${detail === null ? null : JSON.stringify(detail)}, ${nowSeconds})
  `
}

export interface SyncHistoryRow {
  synced_at: number | null
  failed_at: number | null
  failure: SyncFailure | null
  streak_started_at: number | null
}

// One row, read by the audit_log_action index. A failure in the same second as a success does not
// count against it: the success is the one that wrote the list.
export function syncHistoryQuery(): SQL {
  return sql`
    SELECT
      (SELECT max(created_at) FROM audit_log WHERE action = 'bank-holidays.synced') AS synced_at,
      latest.created_at AS failed_at,
      json_extract(latest.detail, '$.failure') AS failure,
      (SELECT min(created_at) FROM audit_log
        WHERE action = 'bank-holidays.sync-failed'
          AND created_at > coalesce((SELECT max(created_at) FROM audit_log WHERE action = 'bank-holidays.synced'), -1)
      ) AS streak_started_at
    FROM (SELECT 1) AS one
    LEFT JOIN (
      SELECT created_at, detail FROM audit_log
      WHERE action = 'bank-holidays.sync-failed'
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    ) AS latest ON 1 = 1
  `
}

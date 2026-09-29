import { sql } from 'drizzle-orm'
import { ATTEMPT_COLUMNS, UNRESOLVED } from './sumup-queries'
import { auditEntry } from '#shared/utils/audit'
import { saysMoney } from '#shared/utils/bar'
import { londonDayOf } from '#shared/utils/ledger'
import { saysClock } from '#shared/utils/when'
import type { SQL } from 'drizzle-orm'
import type { AuditRow } from '#shared/utils/audit'

// Question 15, option 1 (F-124 criterion 9): a charge an earlier night's closed till left
// unanswered posts as a sale on that night. Statements only, so a Bun test runs each of them.

export const LATE_SALE_ACTION = 'bar.till.sale.late'

// A late record the server failed part-way stays where the Treasurer can retry it: MISMATCH is out
// of the sweep's reach, where STARTED past its window would be abandoned with nothing recorded.
export const LATE_RECORD_INTERRUPTED = {
  status: 'MISMATCH',
  error: 'Recording the sale was interrupted; check the reader before retrying',
} as const

// No till open for the charge's bar and night: while one is, the bar records it the usual way.
const tillClosed = (table: string): SQL => sql`NOT EXISTS (
  SELECT 1 FROM till_sessions s WHERE s.venue_id = ${sql.raw(table)}.venue_id AND s.night = ${sql.raw(table)}.night AND s.closed_at IS NULL
)`

// A night's charges for the Treasurer, bounded by the night rather than an id list (0003).
export function lateChargesQuery(night: string): SQL {
  return sql`
    SELECT ${ATTEMPT_COLUMNS} FROM sumup_attempts a LEFT JOIN users u ON u.id = a.created_by
    WHERE a.night = ${night} AND ${UNRESOLVED} AND ${tillClosed('a')}
    ORDER BY a.created_at
  `
}

// The claim carries every precondition on the statement (0003): still unanswered and unposted,
// the till still closed, and the total the screen showed (0005). RETURNING says whether it landed.
export function lateClaimStatement(id: string, expectedTotalPence: number, recorderId: string): SQL {
  return sql`
    UPDATE sumup_attempts SET status = 'COMPLETING', resolution = 'STAFF', resolved_by = ${recorderId}, callback_at = unixepoch()
    WHERE id = ${id} AND status IN ('STARTED', 'MISMATCH') AND entry_id IS NULL
      AND expected_total_pence = ${expectedTotalPence} AND ${tillClosed('sumup_attempts')}
    RETURNING id
  `
}

// Dated when the reader took the money, so the sale falls inside its own show night (0014) and
// its prices are that day's; the audit row says when it was recorded.
export function lateSaleTiming(chargedAt: number): { at: Date, on: string } {
  const at = new Date(chargedAt * 1000)
  return { at, on: londonDayOf(at) }
}

export interface LateSale {
  recorderId: string
  entryId: string
  attemptId: string
  venueId: string
  night: string
  chargedAt: number
}

export function lateSaleAudit(sale: LateSale): AuditRow {
  return auditEntry({
    actorId: sale.recorderId,
    action: LATE_SALE_ACTION,
    target: `ledger-entry:${sale.entryId}`,
    detail: { late: true, night: sale.night, venueId: sale.venueId, attemptId: sale.attemptId, entryId: sale.entryId, chargedAt: sale.chargedAt },
  })
}

// Rides the sale's batch on the entry's own existence, as the sale's other audit rows do (0027).
export function lateSaleAuditStatement(row: AuditRow, entryId: string): SQL {
  return sql`
    INSERT INTO audit_log (id, actor_id, action, target, detail)
    SELECT ${row.id}, ${row.actorId}, ${row.action}, ${row.target}, ${JSON.stringify(row.detail)}
    WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE id = ${entryId})
  `
}

// Every report signed off that night gains an addendum, whatever its venue: each froze the
// night-wide bar figure the late sale has since moved (`reportBarSummary`).
export function lateAddendumStatement(input: { id: string, night: string, entryId: string, addedBy: string, totalPence: number, chargedAt: number }): SQL {
  const note = `Late addition: a card sale of ${saysMoney(input.totalPence)} the reader took at ${saysClock(input.chargedAt)}, recorded after the till closed.`
  return sql`
    INSERT INTO night_report_addenda (id, report_id, note, added_by)
    SELECT ${input.id} || '-' || r.id, r.id, ${note}, ${input.addedBy}
    FROM night_reports r
    WHERE r.night = ${input.night}
      AND EXISTS (SELECT 1 FROM ledger_entries WHERE id = ${input.entryId})
  `
}

// Every sale recorded late for the night, read from its audit row (the ledger has no column).
export function lateAdditionsQuery(night: string): SQL {
  return sql`
    SELECT e.id AS entryId, e.total_pence AS totalPence, e.happened_at AS chargedAt,
      a.created_at AS recordedAt, u.name AS recordedByName,
      (SELECT name FROM venues WHERE id = json_extract(a.detail, '$.venueId')) AS venueName
    FROM audit_log a
    JOIN ledger_entries e ON e.id = json_extract(a.detail, '$.entryId')
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.action = ${LATE_SALE_ACTION} AND json_extract(a.detail, '$.night') = ${night}
    ORDER BY a.created_at, e.id
  `
}

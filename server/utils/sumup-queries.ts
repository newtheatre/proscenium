import { sql } from 'drizzle-orm'
import { OPEN_ATTEMPT_STATUSES, SUMUP_STUCK_COMPLETING_MINUTES } from '#shared/utils/sumup'
import type { SQL } from 'drizzle-orm'

// Split out of sumup-attempts.ts so a test naming these statements never pulls the sale path into
// the Bun graph behind them, the same reason retention-candidates.ts is its own file (0057).

export const ATTEMPT_COLUMNS = sql`
  a.id AS id, a.till_session_id AS tillSessionId, a.venue_id AS venueId, a.night AS night,
  a.created_by AS createdBy, u.name AS createdByName, a.created_at AS createdAt, a.basket AS basket,
  a.expected_total_pence AS expectedTotalPence, a.status AS status, a.smp_status AS smpStatus,
  a.smp_tx_code AS smpTxCode, a.smp_message AS smpMessage, a.smp_failure_cause AS smpFailureCause,
  a.resolution AS resolution, a.resolved_by AS resolvedBy, a.resolved_at AS resolvedAt,
  a.resolution_note AS resolutionNote, a.callback_at AS callbackAt, a.entry_id AS entryId, a.error AS error,
  coalesce(a.kind, 'SUMUP') AS kind
`

// Any bar's hand-off whose money may still reach the one reader (F-124.6, issue 1308).
export const openAttemptsOn = (night: string): SQL =>
  sql`night = ${night} AND status IN (${sql.join(OPEN_ATTEMPT_STATUSES.map(status => sql`${status}`), sql`, `)})`

// How long a row has gone without a word, measured from the answer that began the recording
// rather than from the hand-off, which may have been keyed in an hour before (F-124 criterion 5).
const SINCE_THE_ANSWER = sql`coalesce(a.callback_at, a.created_at)`

// The sweep's own read: a hand-off nobody answered, or a recording nobody finished.
export function stuckAttemptsQuery(at: number, timeoutMinutes: number): SQL {
  return sql`
    SELECT ${ATTEMPT_COLUMNS} FROM sumup_attempts a LEFT JOIN users u ON u.id = a.created_by
    WHERE (a.status = 'STARTED' AND a.created_at < ${at - timeoutMinutes * 60})
       OR (a.status = 'COMPLETING' AND ${SINCE_THE_ANSWER} < ${at - SUMUP_STUCK_COMPLETING_MINUTES * 60})
  `
}

// The sale posted, so the attempt succeeded and names its entry, whatever the row says now (a
// sweep may have called it a mismatch mid-commit); `guard` rides the sale batch's own condition.
export function recordPostedSaleStatement(id: string, entryId: string | null, at: number, guard?: SQL): SQL {
  return sql`
    UPDATE sumup_attempts SET status = 'SUCCEEDED', entry_id = coalesce(${entryId}, entry_id),
      resolved_at = coalesce(resolved_at, ${at}), error = NULL,
      resolution_note = CASE WHEN status = 'COMPLETING' THEN resolution_note ELSE NULL END
    WHERE id = ${id} AND entry_id IS NULL${guard === undefined ? sql.empty() : sql` AND ${guard}`}
    RETURNING id
  `
}

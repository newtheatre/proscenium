import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (0055).
import { periodBounds } from './season-dashboard'
import type { PeriodInput } from '#shared/utils/season-dashboard'
import type { PassUtilisationRow, RevenueByShowReport, ShowRevenueRow, UnattributedRevenue } from '#shared/utils/revenue-by-show'
import type { SQL } from 'drizzle-orm'

// Grouped by the show every ticket line already keys to, via the performance (0001, 0003, 0006):
// one query across every show, never a subquery or a fetch repeated per show.

export function revenueByShowQuery(fromAt: number, toAt: number): SQL {
  return sql`
    SELECT p.show_id AS showId, s.title AS showTitle,
      coalesce(sum(CASE WHEN ll.kind IN ('TICKET_COLLECTION', 'WALK_UP') THEN ll.amount_pence ELSE 0 END), 0) AS grossPence,
      coalesce(sum(CASE WHEN ll.kind = 'REFUND' THEN -ll.amount_pence ELSE 0 END), 0) AS refundedPence,
      coalesce(sum(CASE WHEN ll.kind = 'WALK_UP' THEN ll.amount_pence ELSE 0 END), 0) AS walkUpPence,
      coalesce(sum(CASE WHEN ll.kind = 'TICKET_COLLECTION' THEN ll.amount_pence ELSE 0 END), 0) AS preBookedPence,
      coalesce(sum(CASE WHEN ll.kind = 'PASS_ADMISSION' THEN 1 ELSE 0 END), 0) AS passAdmissions
    FROM ledger_lines ll
    JOIN ledger_entries le ON le.id = ll.entry_id
    JOIN performances p ON p.id = ll.performance_id
    JOIN shows s ON s.id = p.show_id
    WHERE le.happened_at >= ${fromAt} AND le.happened_at < ${toAt}
      AND ll.kind IN ('TICKET_COLLECTION', 'WALK_UP', 'REFUND', 'PASS_ADMISSION')
    GROUP BY p.show_id, s.title
    ORDER BY s.title COLLATE NOCASE
  `
}

// A ticketing line with no performance behind it predates #791/#795 (known-issues.md), the
// fixes that made performance_id reliable: real money, its own bucket, never silently dropped.
export function unattributedRevenueQuery(fromAt: number, toAt: number): SQL {
  return sql`
    SELECT
      coalesce(sum(CASE WHEN ll.kind IN ('TICKET_COLLECTION', 'WALK_UP') THEN ll.amount_pence ELSE 0 END), 0) AS grossPence,
      coalesce(sum(CASE WHEN ll.kind = 'REFUND' THEN -ll.amount_pence ELSE 0 END), 0) AS refundedPence
    FROM ledger_lines ll JOIN ledger_entries le ON le.id = ll.entry_id
    WHERE le.happened_at >= ${fromAt} AND le.happened_at < ${toAt}
      AND ll.performance_id IS NULL AND ll.kind IN ('TICKET_COLLECTION', 'WALK_UP', 'REFUND')
  `
}

// The whole season's ticket revenue, ungrouped: what every per-show row plus the unattributed
// bucket must sum to (criterion 5), proving the grouping neither drops nor doubles a row.
export function seasonTicketRevenueQuery(fromAt: number, toAt: number): SQL {
  return sql`
    SELECT
      coalesce(sum(CASE WHEN ll.kind IN ('TICKET_COLLECTION', 'WALK_UP') THEN ll.amount_pence ELSE 0 END), 0) AS grossPence,
      coalesce(sum(CASE WHEN ll.kind = 'REFUND' THEN -ll.amount_pence ELSE 0 END), 0) AS refundedPence
    FROM ledger_lines ll JOIN ledger_entries le ON le.id = ll.entry_id
    WHERE le.happened_at >= ${fromAt} AND le.happened_at < ${toAt} AND ll.kind IN ('TICKET_COLLECTION', 'WALK_UP', 'REFUND')
  `
}

// A pass's own utilisation: distinct shows it actually admitted to, against every show its type
// covers (`pass_type_shows`), both correlated subqueries rather than a fetch per pass.
export function passUtilisationQuery(fromAt: number, toAt: number): SQL {
  return sql`
    SELECT p.id AS passId, p.reference AS reference, pt.name AS passTypeName, p.price_paid AS pricePaid,
      (SELECT count(*) FROM pass_type_shows pts WHERE pts.pass_type_id = p.pass_type_id) AS coveredShows,
      (SELECT count(DISTINCT perf.show_id) FROM pass_admissions pa
        JOIN performances perf ON perf.id = pa.performance_id WHERE pa.pass_id = p.id) AS admittedShows
    FROM passes p
    JOIN pass_types pt ON pt.id = p.pass_type_id
    WHERE p.created_at >= ${fromAt} AND p.created_at < ${toAt}
    ORDER BY pt.name COLLATE NOCASE, p.reference
  `
}

export async function revenueByShowReport(period: PeriodInput): Promise<RevenueByShowReport> {
  const bounds = periodBounds(period)
  const [rows, [unattributed], passes] = await Promise.all([
    db.all<Omit<ShowRevenueRow, 'netPence'>>(revenueByShowQuery(bounds.fromAt, bounds.toAt)),
    db.all<UnattributedRevenue>(unattributedRevenueQuery(bounds.fromAt, bounds.toAt)),
    db.all<PassUtilisationRow>(passUtilisationQuery(bounds.fromAt, bounds.toAt)),
  ])
  return {
    fromDay: bounds.fromDay,
    toDay: bounds.toDay,
    byShow: rows.map(row => ({ ...row, netPence: row.grossPence - row.refundedPence })),
    unattributed: {
      grossPence: unattributed?.grossPence ?? 0,
      refundedPence: unattributed?.refundedPence ?? 0,
      netPence: (unattributed?.grossPence ?? 0) - (unattributed?.refundedPence ?? 0),
    },
    passes,
  }
}

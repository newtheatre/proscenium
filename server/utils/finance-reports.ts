import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (0055).
import { createError } from 'h3'
import { startOfLondonDay } from '#shared/utils/london'
import type { AccessAdmissionRow, FinanceForegoneReport, FinanceScopeInput, ForegoneReport } from '#shared/utils/finance-reports'
import type { SQL } from 'drizzle-orm'

// Foregone value and access/companion admissions, run fresh from the ledger for the scope asked
// for (I-103): nothing here is a stored total, the same discipline every other report keeps.

const DAY_SECONDS = 24 * 60 * 60

// A period is a London calendar range, exclusive at the end, the same convention F-119's bar
// reports use (0014).
function periodBounds(from: string, to: string): { fromAt: number, toAt: number } {
  const fromAt = Math.floor(startOfLondonDay(from).getTime() / 1000)
  const toAt = Math.floor(startOfLondonDay(to).getTime() / 1000) + DAY_SECONDS
  if (toAt <= fromAt) throw createError({ statusCode: 400, statusMessage: 'A period must end after it starts' })
  return { fromAt, toAt }
}

// Scoped by a subquery on the show's own performances, never an IN list built from a result set
// (0001, 0003): a show with a hundred performances still binds one parameter.
function lineScope(scope: FinanceScopeInput): SQL {
  if (scope.scope === 'SHOW') return sql`ll.performance_id IN (SELECT id FROM performances WHERE show_id = ${scope.showId})`
  const { fromAt, toAt } = periodBounds(scope.from, scope.to)
  return sql`le.happened_at >= ${fromAt} AND le.happened_at < ${toAt}`
}

// A comp line's own amount is always zero (I-102 criterion 4); what was given away is the
// retail price snapshotted on unit_price_pence, never amount_pence (I-103 criterion 1).
export function foregoneQuery(scope: FinanceScopeInput): SQL {
  return sql`
    SELECT
      coalesce(sum(CASE WHEN le.tender = 'COMP' THEN ll.unit_price_pence * ll.qty ELSE 0 END), 0) AS compsPence,
      coalesce(sum(CASE WHEN le.tender = 'COMP' THEN 1 ELSE 0 END), 0) AS compCount,
      coalesce(sum(ll.discount_pence), 0) AS discountsPence,
      coalesce(sum(CASE WHEN ll.discount_pence > 0 THEN 1 ELSE 0 END), 0) AS discountCount
    FROM ledger_lines ll
    JOIN ledger_entries le ON le.id = ll.entry_id
    WHERE ${lineScope(scope)}
  `
}

export async function foregone(scope: FinanceScopeInput): Promise<ForegoneReport> {
  const [row] = await db.all<ForegoneReport>(foregoneQuery(scope))
  return row ?? { compsPence: 0, compCount: 0, discountsPence: 0, discountCount: 0 }
}

// Counts and value only, never a need or a name (criterion 3): the join stops at the ticket
// type, and never reaches access_profiles or the reservation's own booker.
export function accessAdmissionsQuery(scope: FinanceScopeInput): SQL {
  return sql`
    SELECT tt.access_kind AS accessKind, count(*) AS count, coalesce(sum(ll.amount_pence), 0) AS valuePence
    FROM ledger_lines ll
    JOIN ledger_entries le ON le.id = ll.entry_id
    JOIN tickets t ON t.id = ll.ticket_id
    JOIN ticket_types tt ON tt.id = t.ticket_type_id
    WHERE ll.kind IN ('TICKET_COLLECTION', 'WALK_UP') AND tt.access_kind IS NOT NULL AND ${lineScope(scope)}
    GROUP BY tt.access_kind
  `
}

export async function accessAdmissions(scope: FinanceScopeInput): Promise<AccessAdmissionRow[]> {
  return db.all<AccessAdmissionRow>(accessAdmissionsQuery(scope))
}

export async function financeForegoneReport(scope: FinanceScopeInput): Promise<FinanceForegoneReport> {
  const [foregoneReport, admissions] = await Promise.all([foregone(scope), accessAdmissions(scope)])
  return { foregone: foregoneReport, accessAdmissions: admissions }
}

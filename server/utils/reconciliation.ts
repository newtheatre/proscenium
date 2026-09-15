import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { showNightBounds } from '#shared/utils/show-night'
import type { SQL } from 'drizzle-orm'
import type { BarReconciliation, NightReconciliation } from '#shared/utils/reconciliation'

// Reconciliation to the expected SumUp Z figure (F-118), run fresh from the ledger for the show
// night (criterion 1). Each figure is its own exported query, so the night report can share it too.

function windowOf(night: string): { fromAt: number, toAt: number } {
  const { from, to } = showNightBounds(night)
  return { fromAt: Math.floor(from.getTime() / 1000), toAt: Math.floor(to.getTime() / 1000) }
}

// Which bar's money a figure is (F-202 criterion 3). Absent, every figure below is the whole
// night's, which is what the estate's one-bar nights and the night report both want.
export interface ReconciliationScope {
  sessionId?: string
  venueId?: string
}

// Scoped by the session an entry was rung up against, a venue by subquery rather than an id list
// read back first (0003). A session-less entry is outside any scope, so a filter excludes it.
function scoped(scope: ReconciliationScope | undefined): SQL {
  if (scope?.sessionId) return sql` AND e.till_session_id = ${scope.sessionId}`
  if (scope?.venueId) return sql` AND e.till_session_id IN (SELECT id FROM till_sessions WHERE venue_id = ${scope.venueId})`
  return sql.empty()
}

// Card sales already net any future reversal in the same sum rather than excluding it (0031), so
// `refundsQuery` below is itemised for display and never subtracted a second time from this.
export function cardSalesQuery(night: string, scope?: ReconciliationScope): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT coalesce(sum(l.amount_pence), 0) AS cardSalesPence
    FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
    WHERE e.source = 'TILL' AND e.tender = 'CARD' AND l.kind = 'BAR_ITEM'
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}${scoped(scope)}
  `
}

// Ticket money the bar took on its own reader (F-122 criterion 6, F-123): a booking collected
// there and a walk-up sold there, both inside the figure the reader is expected to show.
export function ticketsAtTheBarQuery(night: string, scope?: ReconciliationScope): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT coalesce(sum(l.amount_pence), 0) AS ticketsPence
    FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
    WHERE e.source = 'TILL' AND e.tender = 'CARD' AND l.kind IN ('TICKET_COLLECTION', 'WALK_UP')
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}${scoped(scope)}
  `
}

export function tabSettlementsQuery(night: string, scope?: ReconciliationScope): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT coalesce(sum(l.amount_pence), 0) AS tabSettlementsPence
    FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
    WHERE e.source = 'TILL' AND e.tender = 'CARD' AND l.kind = 'TAB_SETTLEMENT'
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}${scoped(scope)}
  `
}

export function compsQuery(night: string, scope?: ReconciliationScope): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT count(DISTINCT e.id) AS compsCount, coalesce(sum(l.unit_price_pence * l.qty), 0) AS compsForegonePence
    FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
    WHERE e.source = 'TILL' AND e.tender = 'COMP'
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}${scoped(scope)}
  `
}

export function discountsQuery(night: string, scope?: ReconciliationScope): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT coalesce(sum(l.discount_pence), 0) AS discountsPence
    FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
    WHERE e.source = 'TILL' AND l.discount_id IS NOT NULL
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}${scoped(scope)}
  `
}

// Magnitude only, itemising what is already netted into card sales above; never a MVP path yet
// (no bar-sale reversal route exists), so this reads zero until one is built.
export function refundsQuery(night: string, scope?: ReconciliationScope): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT coalesce(-sum(e.total_pence), 0) AS refundsPence
    FROM ledger_entries e
    WHERE e.source = 'TILL' AND e.tender = 'CARD' AND e.reverses_entry_id IS NOT NULL
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}${scoped(scope)}
  `
}

// Credit extended, not money taken (criterion 2): a void posts as a negative TAB entry, so it
// nets against the charge it corrects in the same sum (0031), the same convention as above.
export function tabChargesQuery(night: string, scope?: ReconciliationScope): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT coalesce(sum(e.total_pence), 0) AS tabChargesPence
    FROM ledger_entries e
    WHERE e.source = 'TILL' AND e.tender = 'TAB'
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}${scoped(scope)}
  `
}

// Alongside the bar's own figure (criterion 1): every CARD-tendered desk entry the same night,
// one total rather than the desk's own itemised breakdown, which is D-116's report to build.
export function deskTakingsQuery(night: string): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT coalesce(sum(e.total_pence), 0) AS deskTakingsPence
    FROM ledger_entries e
    WHERE e.source = 'DESK' AND e.tender = 'CARD'
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
  `
}

export async function barReconciliation(night: string, scope?: ReconciliationScope): Promise<BarReconciliation> {
  const [[cardSales], [tickets], [tabSettlements], [comps], [discounts], [refunds], [tabCharges]] = await Promise.all([
    db.all<{ cardSalesPence: number }>(cardSalesQuery(night, scope)),
    db.all<{ ticketsPence: number }>(ticketsAtTheBarQuery(night, scope)),
    db.all<{ tabSettlementsPence: number }>(tabSettlementsQuery(night, scope)),
    db.all<{ compsCount: number, compsForegonePence: number }>(compsQuery(night, scope)),
    db.all<{ discountsPence: number }>(discountsQuery(night, scope)),
    db.all<{ refundsPence: number }>(refundsQuery(night, scope)),
    db.all<{ tabChargesPence: number }>(tabChargesQuery(night, scope)),
  ])

  const cardSalesPence = cardSales?.cardSalesPence ?? 0
  const ticketsPence = tickets?.ticketsPence ?? 0
  const tabSettlementsPence = tabSettlements?.tabSettlementsPence ?? 0
  return {
    night,
    cardSalesPence,
    ticketsPence,
    tabSettlementsPence,
    compsCount: comps?.compsCount ?? 0,
    compsForegonePence: comps?.compsForegonePence ?? 0,
    discountsPence: discounts?.discountsPence ?? 0,
    refundsPence: refunds?.refundsPence ?? 0,
    tabChargesPence: tabCharges?.tabChargesPence ?? 0,
    // Criterion 1: the expected reader total is bar card sales, tickets taken at the bar
    // (F-122 criterion 6) and tab settlements.
    expectedPence: cardSalesPence + ticketsPence + tabSettlementsPence,
  }
}

export async function deskTakingsPence(night: string): Promise<number> {
  const [row] = await db.all<{ deskTakingsPence: number }>(deskTakingsQuery(night))
  return row?.deskTakingsPence ?? 0
}

// The three sums the expected figure is made of, unscoped, for a caller whose bar half is
// narrowed to one session and still owes the night its own whole-day total (F-202 criterion 3).
async function nightExpectedBarPence(night: string): Promise<number> {
  const [[cardSales], [tickets], [tabSettlements]] = await Promise.all([
    db.all<{ cardSalesPence: number }>(cardSalesQuery(night)),
    db.all<{ ticketsPence: number }>(ticketsAtTheBarQuery(night)),
    db.all<{ tabSettlementsPence: number }>(tabSettlementsQuery(night)),
  ])
  return (cardSales?.cardSalesPence ?? 0) + (tickets?.ticketsPence ?? 0) + (tabSettlements?.tabSettlementsPence ?? 0)
}

// The desk's own takings are never scoped: they belong to no bar session. The whole-day figure
// stays the night's whichever bar the breakdown beside it is about (F-118 criterion 1, F-202.3).
export async function nightReconciliation(night: string, scope?: ReconciliationScope): Promise<NightReconciliation> {
  const [bar, deskPence] = await Promise.all([barReconciliation(night, scope), deskTakingsPence(night)])
  const barPence = scope ? await nightExpectedBarPence(night) : bar.expectedPence
  return { bar, deskTakingsPence: deskPence, wholeNightExpectedPence: barPence + deskPence }
}

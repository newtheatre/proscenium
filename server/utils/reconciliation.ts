import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { showNightBounds } from '#shared/utils/show-night'
import type { SQL } from 'drizzle-orm'
import type { BarReconciliation, NightReconciliation } from '#shared/utils/reconciliation'

// Reconciliation to the expected SumUp Z figure (F-118). Every figure is a query over the ledger
// for the show night, run fresh, the same discipline F-119's reports keep (criterion 1). Each
// figure is its own exported query, the night-report's own convention, so a test can run one
// against an isolated database and the night report (criterion 4) can share the exact SQL.

function windowOf(night: string): { fromAt: number, toAt: number } {
  const { from, to } = showNightBounds(night)
  return { fromAt: Math.floor(from.getTime() / 1000), toAt: Math.floor(to.getTime() / 1000) }
}

// Card sales already net any future reversal in the same sum rather than excluding it (0031), so
// `refundsQuery` below is itemised for display and never subtracted a second time from this.
export function cardSalesQuery(night: string): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT coalesce(sum(l.amount_pence), 0) AS cardSalesPence
    FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
    WHERE e.source = 'TILL' AND e.tender = 'CARD' AND l.kind = 'BAR_ITEM'
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
  `
}

export function tabSettlementsQuery(night: string): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT coalesce(sum(l.amount_pence), 0) AS tabSettlementsPence
    FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
    WHERE e.source = 'TILL' AND e.tender = 'CARD' AND l.kind = 'TAB_SETTLEMENT'
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
  `
}

export function compsQuery(night: string): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT count(DISTINCT e.id) AS compsCount, coalesce(sum(l.unit_price_pence * l.qty), 0) AS compsForegonePence
    FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
    WHERE e.source = 'TILL' AND e.tender = 'COMP'
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
  `
}

export function discountsQuery(night: string): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT coalesce(sum(l.discount_pence), 0) AS discountsPence
    FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
    WHERE e.source = 'TILL' AND l.discount_id IS NOT NULL
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
  `
}

// Magnitude only, itemising what is already netted into card sales above; never a MVP path yet
// (no bar-sale reversal route exists), so this reads zero until one is built.
export function refundsQuery(night: string): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT coalesce(-sum(e.total_pence), 0) AS refundsPence
    FROM ledger_entries e
    WHERE e.source = 'TILL' AND e.tender = 'CARD' AND e.reverses_entry_id IS NOT NULL
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
  `
}

// Credit extended, not money taken (criterion 2): a void posts as a negative TAB entry, so it
// nets against the charge it corrects in the same sum (0031), the same convention as above.
export function tabChargesQuery(night: string): SQL {
  const { fromAt, toAt } = windowOf(night)
  return sql`
    SELECT coalesce(sum(e.total_pence), 0) AS tabChargesPence
    FROM ledger_entries e
    WHERE e.source = 'TILL' AND e.tender = 'TAB'
      AND e.happened_at >= ${fromAt} AND e.happened_at < ${toAt}
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

export async function barReconciliation(night: string): Promise<BarReconciliation> {
  const [[cardSales], [tabSettlements], [comps], [discounts], [refunds], [tabCharges]] = await Promise.all([
    db.all<{ cardSalesPence: number }>(cardSalesQuery(night)),
    db.all<{ tabSettlementsPence: number }>(tabSettlementsQuery(night)),
    db.all<{ compsCount: number, compsForegonePence: number }>(compsQuery(night)),
    db.all<{ discountsPence: number }>(discountsQuery(night)),
    db.all<{ refundsPence: number }>(refundsQuery(night)),
    db.all<{ tabChargesPence: number }>(tabChargesQuery(night)),
  ])

  const cardSalesPence = cardSales?.cardSalesPence ?? 0
  const tabSettlementsPence = tabSettlements?.tabSettlementsPence ?? 0
  return {
    night,
    cardSalesPence,
    tabSettlementsPence,
    compsCount: comps?.compsCount ?? 0,
    compsForegonePence: comps?.compsForegonePence ?? 0,
    discountsPence: discounts?.discountsPence ?? 0,
    refundsPence: refunds?.refundsPence ?? 0,
    tabChargesPence: tabCharges?.tabChargesPence ?? 0,
    // Criterion 1: the expected reader total is bar card sales plus tab settlements.
    expectedPence: cardSalesPence + tabSettlementsPence,
  }
}

export async function deskTakingsPence(night: string): Promise<number> {
  const [row] = await db.all<{ deskTakingsPence: number }>(deskTakingsQuery(night))
  return row?.deskTakingsPence ?? 0
}

export async function nightReconciliation(night: string): Promise<NightReconciliation> {
  const [bar, deskPence] = await Promise.all([barReconciliation(night), deskTakingsPence(night)])
  return { bar, deskTakingsPence: deskPence, wholeNightExpectedPence: bar.expectedPence + deskPence }
}

import { db, schema } from '@nuxthub/db'
import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'

/**
 * The Treasurer's two questions are one click each: sales by month by tender,
 * and closing stock at cost. Design: docs/13-bar-design.md §6
 */

export type SalesGrouping = 'product' | 'category' | 'performance' | 'month'

/** Bar lines only. Ticket money is the box office's report, not the bar's. */
function barLineRange(from: string, to: string) {
  return and(
    eq(schema.transactionLines.kind, 'BAR_ITEM'),
    gte(schema.transactions.takenOn, from),
    lte(schema.transactions.takenOn, to),
    isNull(schema.transactions.voidedAt),
  )
}

export async function salesBy(grouping: SalesGrouping, from: string, to: string, limit: number, offset: number) {
  const key = {
    product: schema.barProducts.name,
    category: schema.barCategories.name,
    performance: schema.shows.title,
    month: sql<string>`substr(${schema.transactions.takenOn}, 1, 7)`,
  }[grouping]

  const base = db.select({
    label: sql<string>`coalesce(${key}, 'Unattributed')`.as('label'),
    qty: sql<number>`coalesce(sum(${schema.transactionLines.qty}), 0)`,
    grossPence: sql<number>`coalesce(sum(${schema.transactionLines.amountPence}), 0)`,
    cardPence: sql<number>`coalesce(sum(case when ${schema.transactions.tender} = 'CARD' then ${schema.transactionLines.amountPence} else 0 end), 0)`,
    tabPence: sql<number>`coalesce(sum(case when ${schema.transactions.tender} = 'TAB' then ${schema.transactionLines.amountPence} else 0 end), 0)`,
    compPence: sql<number>`coalesce(sum(case when ${schema.transactions.tender} = 'COMP' then ${schema.transactionLines.amountPence} else 0 end), 0)`,
  })
    .from(schema.transactionLines)
    .innerJoin(schema.transactions, eq(schema.transactions.id, schema.transactionLines.transactionId))
    .leftJoin(schema.barProducts, eq(schema.barProducts.id, schema.transactionLines.productId))
    .leftJoin(schema.barCategories, eq(schema.barCategories.id, schema.barProducts.categoryId))
    .leftJoin(schema.performances, eq(schema.performances.id, schema.transactionLines.performanceId))
    .leftJoin(schema.shows, eq(schema.shows.id, schema.performances.showId))
    .where(barLineRange(from, to))
    .groupBy(sql`label`)

  const rows = await base
    .orderBy(grouping === 'month' ? asc(sql`label`) : desc(sql`3`))
    .limit(limit).offset(offset)

  const [total] = await db.select({ value: sql<number>`count(distinct coalesce(${key}, 'Unattributed'))` })
    .from(schema.transactionLines)
    .innerJoin(schema.transactions, eq(schema.transactions.id, schema.transactionLines.transactionId))
    .leftJoin(schema.barProducts, eq(schema.barProducts.id, schema.transactionLines.productId))
    .leftJoin(schema.barCategories, eq(schema.barCategories.id, schema.barProducts.categoryId))
    .leftJoin(schema.performances, eq(schema.performances.id, schema.transactionLines.performanceId))
    .leftJoin(schema.shows, eq(schema.shows.id, schema.performances.showId))
    .where(barLineRange(from, to))

  return { rows: rows.map(normaliseSales), total: Number(total?.value ?? 0) }
}

function normaliseSales(row: Record<string, unknown>) {
  return {
    label: String(row.label),
    qty: Number(row.qty ?? 0),
    grossPence: Number(row.grossPence ?? 0),
    cardPence: Number(row.cardPence ?? 0),
    tabPence: Number(row.tabPence ?? 0),
    compPence: Number(row.compPence ?? 0),
  }
}

/** What was given away, by discount and by who rang it up. */
export async function discountsIn(from: string, to: string) {
  const range = and(
    gte(schema.transactions.takenOn, from),
    lte(schema.transactions.takenOn, to),
    sql`${schema.transactions.discountPence} > 0`,
  )

  const byType = await db.select({
    label: sql<string>`coalesce(${schema.barDiscounts.name}, 'Unnamed')`,
    uses: sql<number>`count(*)`,
    pence: sql<number>`coalesce(sum(${schema.transactions.discountPence}), 0)`,
  })
    .from(schema.transactions)
    .leftJoin(schema.barDiscounts, eq(schema.barDiscounts.id, schema.transactions.discountId))
    .where(range)
    .groupBy(schema.transactions.discountId)
    .orderBy(desc(sql`3`))

  const byStaff = await db.select({
    label: sql<string>`coalesce(${schema.users.name}, 'Unknown')`,
    uses: sql<number>`count(*)`,
    pence: sql<number>`coalesce(sum(${schema.transactions.discountPence}), 0)`,
  })
    .from(schema.transactions)
    .leftJoin(schema.users, eq(schema.users.id, schema.transactions.takenByUserId))
    .where(range)
    .groupBy(schema.transactions.takenByUserId)
    .orderBy(desc(sql`3`))

  return {
    byType: byType.map(r => ({ label: String(r.label), uses: Number(r.uses), pence: Number(r.pence) })),
    byStaff: byStaff.map(r => ({ label: String(r.label), uses: Number(r.uses), pence: Number(r.pence) })),
  }
}

/** Comps by reason, always naming both the requester and the approver. */
export async function compsIn(from: string, to: string) {
  const requester = alias(schema.users, 'comp_requester')
  const approver = alias(schema.users, 'comp_approver')

  const rows = await db.select({
    night: schema.compRequests.night,
    reason: schema.compRequests.reason,
    note: schema.compRequests.note,
    grossPence: schema.compRequests.grossPence,
    lines: schema.compRequests.lines,
    requestedBy: requester.name,
    approvedBy: approver.name,
  })
    .from(schema.compRequests)
    .leftJoin(requester, eq(requester.id, schema.compRequests.requestedByUserId))
    .leftJoin(approver, eq(approver.id, schema.compRequests.decidedByUserId))
    .where(and(
      eq(schema.compRequests.status, 'APPROVED'),
      gte(schema.compRequests.night, from),
      lte(schema.compRequests.night, to),
    ))
    .orderBy(desc(schema.compRequests.night))

  const byReason = new Map<string, { count: number, pence: number }>()
  for (const row of rows) {
    const seen = byReason.get(row.reason) ?? { count: 0, pence: 0 }
    byReason.set(row.reason, { count: seen.count + 1, pence: seen.pence + row.grossPence })
  }

  return {
    rows: rows.map(r => ({
      night: r.night,
      what: r.lines.map(l => `${l.qty} x ${l.name}`).join(', '),
      reason: r.reason,
      note: r.note,
      grossPence: r.grossPence,
      requestedBy: r.requestedBy,
      approvedBy: r.approvedBy,
    })),
    byReason: [...byReason].map(([reason, v]) => ({ reason, ...v })),
  }
}

/**
 * Gross profit per product: today's price against the latest delivery cost,
 * scaled by what a sale actually depletes (docs/13 §3.1).
 */
export async function grossProfit() {
  const products = await db.select({
    id: schema.barProducts.id,
    name: schema.barProducts.name,
    containerMl: schema.barProducts.containerMl,
    stockProductId: schema.barProducts.stockProductId,
    depletesQty: schema.barProducts.depletesQty,
    status: schema.barProducts.status,
  }).from(schema.barProducts).orderBy(asc(schema.barProducts.sort))

  const [prices, costs] = await Promise.all([
    currentPrices(products.map(p => p.id)),
    latestCostByProduct(),
  ])
  const sizes = new Map(products.map(p => [p.id, p.containerMl]))

  return products
    .filter(p => p.status !== 'RETIRED')
    .map((product) => {
      const price = prices.get(product.id)?.pricePence ?? null
      const taken = product.stockProductId && product.depletesQty == null
        ? null
        : Math.abs(depletion(product, 1).qty)
      const stockId = product.stockProductId ?? product.id
      const containerCost = costs.get(stockId) ?? null
      // Cost of what this sale takes off the shelf, not of a whole container.
      const cost = containerCost == null || taken == null
        ? null
        : Math.round((containerCost * taken) / containerSize({ containerMl: sizes.get(stockId) ?? null }))
      const margin = price == null || cost == null ? null : price - cost
      return {
        name: product.name,
        pricePence: price,
        costPence: cost,
        marginPence: margin,
        gpPercent: margin == null || !price ? null : Math.round((margin / price) * 1000) / 10,
      }
    })
}

/** Stocktake variance over time: is the shrinkage getting better or worse. */
export async function varianceOverTime(from: string, to: string) {
  const rows = await db.select({
    stocktakeId: schema.stocktakes.id,
    finishedAt: schema.stocktakes.finishedAt,
    productName: schema.barProducts.name,
    containerMl: schema.barProducts.containerMl,
    varianceQty: sql<number>`${schema.stocktakeLines.countedQty} - ${schema.stocktakeLines.expectedQty}`,
  })
    .from(schema.stocktakeLines)
    .innerJoin(schema.stocktakes, eq(schema.stocktakes.id, schema.stocktakeLines.stocktakeId))
    .innerJoin(schema.barProducts, eq(schema.barProducts.id, schema.stocktakeLines.productId))
    .where(and(
      eq(schema.stocktakes.status, 'APPLIED'),
      gte(schema.stocktakes.finishedAt, from),
      lte(schema.stocktakes.finishedAt, `${to} 23:59:59`),
      sql`${schema.stocktakeLines.countedQty} is not null`,
    ))
    .orderBy(desc(schema.stocktakes.finishedAt))

  return rows.map(r => ({
    stocktakeId: r.stocktakeId,
    finishedAt: r.finishedAt,
    productName: r.productName,
    containerMl: r.containerMl,
    varianceQty: Number(r.varianceQty ?? 0),
    varianceContainers: qtyToContainers(r, Number(r.varianceQty ?? 0)),
  }))
}

/** The term the date sits in, so the pickers open on something useful. */
export async function currentTerm(today = londonDate()): Promise<{ from: string, to: string, name: string }> {
  const season = await db.select({
    name: schema.seasons.name,
    startsAt: schema.seasons.startsAt,
    endsAt: schema.seasons.endsAt,
  })
    .from(schema.seasons)
    .where(and(
      lte(schema.seasons.startsAt, new Date(`${today}T23:59:59Z`)),
      gte(schema.seasons.endsAt, new Date(`${today}T00:00:00Z`)),
    ))
    .get()

  if (season) {
    return { from: londonDate(season.startsAt), to: londonDate(season.endsAt), name: season.name }
  }

  // No season covers today: the last 90 days is a more useful default than
  // an empty range, and says so by being named.
  const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  return { from: londonDate(start), to: today, name: 'Last 90 days' }
}

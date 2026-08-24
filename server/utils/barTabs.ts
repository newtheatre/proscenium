import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { and, asc, count, desc, eq, inArray, isNull, lte, sql, sum } from 'drizzle-orm'

/**
 * Bar tabs: a sale on credit, settled later by card on the reader (ADR-0030).
 * The debt is `total_pence` on an unsettled, unvoided TAB transaction.
 */

/** Over this, the tab screen asks them to settle up. It never blocks. */
export const TAB_SOFT_CAP_PENCE = 2000

export interface TabChargeItem {
  name: string
  qty: number
  unitPricePence: number
}

export interface TabCharge {
  id: string
  takenAt: Date
  takenOn: string
  totalPence: number
  source: string
  settledAt: Date | null
  items: TabChargeItem[]
}

const unsettled = (userId: string) => and(
  eq(schema.transactions.tender, 'TAB'),
  eq(schema.transactions.tabDebtorUserId, userId),
  isNull(schema.transactions.tabSettledAt),
  isNull(schema.transactions.voidedAt),
)

/** Itemised charges for one person, newest first. Settled ones on request. */
export async function chargesFor(userId: string, settled = false): Promise<TabCharge[]> {
  const rows = await db.select({
    id: schema.transactions.id,
    takenAt: schema.transactions.takenAt,
    takenOn: schema.transactions.takenOn,
    totalPence: schema.transactions.totalPence,
    source: schema.transactions.source,
    settledAt: schema.transactions.tabSettledAt,
  }).from(schema.transactions)
    .where(and(
      eq(schema.transactions.tender, 'TAB'),
      eq(schema.transactions.tabDebtorUserId, userId),
      isNull(schema.transactions.voidedAt),
      settled ? sql`${schema.transactions.tabSettledAt} is not null` : isNull(schema.transactions.tabSettledAt),
    ))
    .orderBy(desc(schema.transactions.takenAt))
    .limit(100)

  if (!rows.length) return []

  // Joined on the debtor rather than a bound list of transaction ids (ADR-0006).
  const lines = await db.select({
    transactionId: schema.transactionLines.transactionId,
    qty: schema.transactionLines.qty,
    unitPricePence: schema.transactionLines.unitPricePence,
    name: schema.barProducts.name,
  }).from(schema.transactionLines)
    .innerJoin(schema.transactions, eq(schema.transactionLines.transactionId, schema.transactions.id))
    .leftJoin(schema.barProducts, eq(schema.transactionLines.productId, schema.barProducts.id))
    .where(and(
      eq(schema.transactions.tabDebtorUserId, userId),
      eq(schema.transactionLines.kind, 'BAR_ITEM'),
    ))

  const items = new Map<string, TabChargeItem[]>()
  for (const line of lines) {
    const list = items.get(line.transactionId) ?? []
    list.push({
      name: line.name ?? 'Unknown item',
      qty: line.qty ?? 1,
      unitPricePence: line.unitPricePence ?? 0,
    })
    items.set(line.transactionId, list)
  }

  return rows.map(row => ({ ...row, items: items.get(row.id) ?? [] }))
}

export async function outstandingFor(userId: string): Promise<number> {
  const row = await db.select({ total: sum(schema.transactions.totalPence) })
    .from(schema.transactions).where(unsettled(userId)).get()
  return Number(row?.total ?? 0)
}

/** Balances for a bounded set of people, for the till's picker. */
export async function outstandingByHolder(userIds: string[]): Promise<Map<string, number>> {
  const balances = new Map<string, number>()
  if (!userIds.length) return balances

  // Chunked, so the parameter count does not grow with the committee (ADR-0006).
  for (const group of chunked(userIds, 20)) {
    const rows = await db.select({
      userId: schema.transactions.tabDebtorUserId,
      total: sum(schema.transactions.totalPence),
    }).from(schema.transactions)
      .where(and(
        eq(schema.transactions.tender, 'TAB'),
        inArray(schema.transactions.tabDebtorUserId, group),
        isNull(schema.transactions.tabSettledAt),
        isNull(schema.transactions.voidedAt),
      ))
      .groupBy(schema.transactions.tabDebtorUserId)
    for (const row of rows) {
      if (row.userId) balances.set(row.userId, Number(row.total ?? 0))
    }
  }
  return balances
}

export interface TabDebtor {
  userId: string
  name: string
  email: string
  anonymisedAt: string | null
  chargeCount: number
  outstandingPence: number
  oldestChargeOn: string
}

/** Everyone with something outstanding, biggest debt first. */
export async function outstandingByPerson(limit: number, offset: number): Promise<{ rows: TabDebtor[], total: number }> {
  const where = and(
    eq(schema.transactions.tender, 'TAB'),
    isNull(schema.transactions.tabSettledAt),
    isNull(schema.transactions.voidedAt),
  )

  const [rows, total] = await Promise.all([
    db.select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      anonymisedAt: schema.users.anonymisedAt,
      chargeCount: count(schema.transactions.id),
      outstandingPence: sum(schema.transactions.totalPence),
      oldestChargeOn: sql<string>`min(${schema.transactions.takenOn})`,
    }).from(schema.transactions)
      .innerJoin(schema.users, eq(schema.transactions.tabDebtorUserId, schema.users.id))
      .where(where)
      .groupBy(schema.users.id)
      .orderBy(desc(sum(schema.transactions.totalPence)))
      .limit(limit).offset(offset),
    db.select({ n: sql<number>`count(distinct ${schema.transactions.tabDebtorUserId})` })
      .from(schema.transactions).where(where).get(),
  ])

  return {
    rows: rows.map(row => ({ ...row, outstandingPence: Number(row.outstandingPence ?? 0) })),
    total: Number(total?.n ?? 0),
  }
}

/**
 * Clear a person's whole balance as at now, against one CARD transaction.
 * Whoever held the reader is `takenByUserId`, never the debtor (ADR-0030).
 */
export async function settleTab(opts: {
  debtorUserId: string
  takenByUserId: string
  source: (typeof schema.TRANSACTION_SOURCES)[number]
  expectedTotalPence: number
  barSessionId?: string | null
}) {
  const asOf = new Date()
  const owed = await db.select({ total: sum(schema.transactions.totalPence) })
    .from(schema.transactions)
    .where(and(unsettled(opts.debtorUserId), lte(schema.transactions.takenAt, asOf)))
    .get()
  const totalPence = Number(owed?.total ?? 0)

  if (totalPence <= 0) {
    throw createError({ statusCode: 409, statusMessage: 'There is nothing outstanding on that tab.' })
  }
  if (totalPence !== opts.expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen showed ${formatPence(opts.expectedTotalPence)} but the tab is ${formatPence(totalPence)}. Reload before taking payment.`,
    })
  }

  const built = buildTransaction({
    source: opts.source,
    tender: 'CARD',
    takenByUserId: opts.takenByUserId,
    barSessionId: opts.barSessionId ?? null,
    settlementLines: [{ amountPence: totalPence }],
  })

  // The settlement row is inserted before anything points at it, and no stock
  // moves: the stock left the shelf when the tab was charged.
  const statements: BatchItem<'sqlite'>[] = [
    ...built.statements,
    // Scoped by predicate, never an id list, so a concurrent settle is a no-op.
    db.update(schema.transactions)
      .set({ tabSettledAt: asOf, tabSettlementTransactionId: built.transactionId })
      .where(and(unsettled(opts.debtorUserId), lte(schema.transactions.takenAt, asOf))),
  ]
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

  return { transactionId: built.transactionId, totalPence }
}

/**
 * Opposing movements for a voided charge, copied from the original SALE rows.
 * Never recomputed: the catalogue may have changed since (ADR-0031).
 */
export async function reversalMovementsFor(transactionId: string, byUserId: string) {
  const sales = await db.select({
    productId: schema.stockMovements.productId,
    qty: schema.stockMovements.qty,
    costPencePerContainer: schema.stockMovements.costPencePerContainer,
  }).from(schema.stockMovements)
    .where(and(
      eq(schema.stockMovements.refTable, 'transactions'),
      eq(schema.stockMovements.refId, transactionId),
      eq(schema.stockMovements.kind, 'SALE'),
    ))
    .orderBy(asc(schema.stockMovements.createdAt))

  return sales.map(sale => ({
    productId: sale.productId,
    qty: -sale.qty,
    kind: 'VOID' as const,
    refTable: 'transactions',
    refId: transactionId,
    costPencePerContainer: sale.costPencePerContainer,
    reason: 'Tab charge voided',
    createdByUserId: byUserId,
  }))
}

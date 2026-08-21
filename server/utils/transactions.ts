import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { and, eq, gte, isNull, lte } from 'drizzle-orm'
import { nanoid } from 'nanoid'

/**
 * The one writer of the money record (ADR-0023). D1 has no interactive
 * transactions, so everything here returns statements for one `db.batch()`.
 */

/** Line rows per insert, so no statement can approach D1's 100 (ADR-0006). */
const LINES_PER_INSERT = 8

export interface TicketPaymentLine {
  reservationId: string
  performanceId: string
  amountPence: number
}

export interface BarItemLine {
  productId: string
  qty: number
  unitPricePence: number
  priceId: string
}

export interface TransactionDraft {
  source: (typeof schema.TRANSACTION_SOURCES)[number]
  tender: (typeof schema.TENDERS)[number]
  takenByUserId: string
  ticketLines?: TicketPaymentLine[]
  /** `WALK_UP` rather than `TICKET_PAYMENT`: a new sale, not a debt settled. */
  walkUpLines?: TicketPaymentLine[]
  barLines?: BarItemLine[]
  /** Applies to the bar subtotal only. Ticket lines are never discounted. */
  discount?: { id: string, percent: number } | null
  compReason?: string | null
  compApprovedByUserId?: string | null
  barSessionId?: string | null
  takenAt?: Date
}

export interface BuiltTransaction {
  transactionId: string
  /** After discount: the figure to type into the reader. */
  totalPence: number
  ticketSubtotal: number
  barSubtotal: number
  discountPence: number
  statements: BatchItem<'sqlite'>[]
}

function chunked<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

/**
 * Statements for one transaction and its lines. Nothing is written here: the
 * caller batches these with whatever else must succeed or fail alongside.
 */
export function buildTransaction(draft: TransactionDraft): BuiltTransaction {
  const takenAt = draft.takenAt ?? new Date()
  const transactionId = nanoid()

  const ticketRows = [
    ...(draft.ticketLines ?? []).map(line => ({ ...line, kind: 'TICKET_PAYMENT' as const })),
    ...(draft.walkUpLines ?? []).map(line => ({ ...line, kind: 'WALK_UP' as const })),
  ]
  const barRows = (draft.barLines ?? []).map(line => ({
    ...line,
    kind: 'BAR_ITEM' as const,
    amountPence: line.unitPricePence * line.qty,
  }))

  const ticketSubtotal = ticketRows.reduce((total, line) => total + line.amountPence, 0)
  // Gross, because the discount lives on the transaction: product reports stay
  // honest and "what did we give away" is one sum (docs/13 §4.1.1).
  const barSubtotal = barRows.reduce((total, line) => total + line.amountPence, 0)
  const discountPence = applyDiscount(barSubtotal, draft.discount?.percent)
  const totalPence = ticketSubtotal + barSubtotal - discountPence

  const statements: BatchItem<'sqlite'>[] = [
    db.insert(schema.transactions).values({
      id: transactionId,
      takenAt,
      takenOn: londonDate(takenAt),
      takenByUserId: draft.takenByUserId,
      source: draft.source,
      tender: draft.tender,
      barSessionId: draft.barSessionId ?? null,
      compReason: draft.compReason ?? null,
      compApprovedByUserId: draft.compApprovedByUserId ?? null,
      compApprovedAt: draft.tender === 'COMP' ? takenAt : null,
      discountId: draft.discount?.id ?? null,
      discountPercent: draft.discount?.percent ?? null,
      discountPence,
      totalPence: draft.tender === 'COMP' ? 0 : totalPence,
    }),
  ]

  for (const group of chunked(ticketRows, LINES_PER_INSERT)) {
    statements.push(db.insert(schema.transactionLines).values(group.map(line => ({
      transactionId,
      kind: line.kind,
      amountPence: line.amountPence,
      reservationId: line.reservationId,
      performanceId: line.performanceId,
    }))))
  }

  for (const group of chunked(barRows, LINES_PER_INSERT)) {
    statements.push(db.insert(schema.transactionLines).values(group.map(line => ({
      transactionId,
      kind: line.kind,
      amountPence: line.amountPence,
      productId: line.productId,
      qty: line.qty,
      unitPricePence: line.unitPricePence,
      priceId: line.priceId,
    }))))
  }

  return { transactionId, totalPence, ticketSubtotal, barSubtotal, discountPence, statements }
}

/**
 * What a reservation owes: unrefunded tickets at the price they were sold at,
 * never the current price. Zero once collected (ADR-0011).
 */
export async function amountOwedFor(reservationId: string): Promise<{ amountPence: number, performanceId: string } | null> {
  const reservation = await db.select({
    id: schema.reservations.id,
    status: schema.reservations.status,
    performanceId: schema.reservations.performanceId,
  }).from(schema.reservations).where(eq(schema.reservations.id, reservationId)).get()

  if (!reservation) return null

  const tickets = await db.select({ pricePaid: schema.tickets.pricePaid })
    .from(schema.tickets)
    .where(and(
      eq(schema.tickets.reservationId, reservationId),
      isNull(schema.tickets.refundedAt),
    ))

  return {
    amountPence: tickets.reduce((total, ticket) => total + ticket.pricePaid, 0),
    performanceId: reservation.performanceId,
  }
}

export interface DayReconciliation {
  day: string
  cardTickets: number
  cardTicketsOtherPerformances: number
  cardBar: number
  cardDesk: number
  cardTill: number
  expectedZPence: number
  compPence: number
  discountPence: number
}

/**
 * What the reader's daily total should read, by `taken_on` alone. "How did that
 * show do" is a different question with a different key (docs/13 §4.5).
 */
export async function reconciliation(day: string): Promise<DayReconciliation> {
  const rows = await db.select({
    id: schema.transactions.id,
    source: schema.transactions.source,
    tender: schema.transactions.tender,
    totalPence: schema.transactions.totalPence,
    discountPence: schema.transactions.discountPence,
    voidedAt: schema.transactions.voidedAt,
    kind: schema.transactionLines.kind,
    amountPence: schema.transactionLines.amountPence,
    performanceId: schema.transactionLines.performanceId,
  })
    .from(schema.transactions)
    .leftJoin(schema.transactionLines, eq(schema.transactionLines.transactionId, schema.transactions.id))
    .where(and(
      eq(schema.transactions.takenOn, day),
      isNull(schema.transactions.voidedAt),
    ))

  const totals = {
    day,
    cardTickets: 0,
    cardTicketsOtherPerformances: 0,
    cardBar: 0,
    cardDesk: 0,
    cardTill: 0,
    expectedZPence: 0,
    compPence: 0,
    discountPence: 0,
  }

  const countedTransactions = new Set<string>()
  const performancesToday = await performanceIdsOn(day)

  for (const row of rows) {
    if (row.tender === 'COMP') {
      totals.compPence += row.amountPence ?? 0
      continue
    }
    if (row.kind === 'BAR_ITEM') totals.cardBar += row.amountPence ?? 0
    else if (row.kind) totals.cardTickets += row.amountPence ?? 0

    // Informational: money taken today for a show on another night.
    if (row.kind && row.kind !== 'BAR_ITEM' && row.performanceId && !performancesToday.has(row.performanceId)) {
      totals.cardTicketsOtherPerformances += row.amountPence ?? 0
    }

    if (!countedTransactions.has(row.id)) {
      countedTransactions.add(row.id)
      totals.expectedZPence += row.totalPence
      totals.discountPence += row.discountPence
      if (row.source === 'TILL') totals.cardTill += row.totalPence
      else totals.cardDesk += row.totalPence
    }
  }

  return totals
}

/** Performances on a given London day, for the advance-payment breakdown. */
async function performanceIdsOn(day: string): Promise<Set<string>> {
  const rows = await db.select({ id: schema.performances.id })
    .from(schema.performances)
    .where(and(
      gte(schema.performances.startsAt, validityStart(day)),
      lte(schema.performances.startsAt, validityEnd(day)),
    ))
  return new Set(rows.map(r => r.id))
}

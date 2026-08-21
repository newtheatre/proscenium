import { db, schema } from '@nuxthub/db'
import type { BatchItem } from 'drizzle-orm/batch'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  /** Only CARD here: a comp is a request, and needs approval first (#166). */
  tender: z.literal('CARD'),
  barItems: z.array(z.object({
    productId: z.string().trim().min(1),
    qty: z.coerce.number().int().min(1).max(99),
  })).max(40).optional().default([]),
  /** Reservations to settle. The till pays what is owed; it never edits. */
  reservationIds: z.array(z.string().trim().min(1)).max(10).optional().default([]),
  discountId: z.string().trim().min(1).nullable().optional(),
  /** The gold figure the screen showed. Checked, not trusted (ADR-0023). */
  expectedTotalPence: z.coerce.number().int().min(0),
})

/** POST /api/bar/transactions — one tap, one transaction, one figure. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const night = await requireBarScope(user)
  const input = await readValidatedBody(event, bodySchema.parse)

  if (!input.barItems.length && !input.reservationIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing in the basket.' })
  }

  const session = await db.select({ id: schema.barSessions.id }).from(schema.barSessions)
    .where(and(eq(schema.barSessions.night, night), isNull(schema.barSessions.closedAt))).get()

  // Bar lines: price snapshotted now, exactly as a ticket's pricePaid is.
  const prices = await currentPrices(input.barItems.map(item => item.productId))
  const barLines = input.barItems.map((item) => {
    const price = prices.get(item.productId)
    if (!price) throw createError({ statusCode: 409, statusMessage: 'One of those has no price set. Reload the till.' })
    return { productId: item.productId, qty: item.qty, unitPricePence: price.pricePence, priceId: price.priceId }
  })

  // Ticket lines: what is owed, and the collection transition alongside.
  const ticketLines = []
  const collections: BatchItem<'sqlite'>[] = []
  for (const reservationId of input.reservationIds) {
    const reservation = await db.select({
      id: schema.reservations.id,
      status: schema.reservations.status,
    }).from(schema.reservations).where(eq(schema.reservations.id, reservationId)).get()

    if (!reservation) throw createError({ statusCode: 404, statusMessage: 'That booking no longer exists.' })
    if (isCollected(reservation.status)) {
      throw createError({ statusCode: 409, statusMessage: 'That booking has already been paid. Reload the till.' })
    }

    const owed = await amountOwedFor(reservationId)
    if (!owed) throw createError({ statusCode: 404, statusMessage: 'That booking no longer exists.' })

    ticketLines.push({ reservationId, performanceId: owed.performanceId, amountPence: owed.amountPence })
    collections.push(
      db.update(schema.reservations).set({ status: 'COLLECTED' })
        .where(eq(schema.reservations.id, reservationId)),
    )
  }

  // Resolved before anything is built, so a missing rule fails before the money.
  const rules = barLines.length ? await depletionRules() : new Map()
  const depleting = barLines.map((line) => {
    const product = rules.get(line.productId)
    if (!product) throw createError({ statusCode: 409, statusMessage: 'One of those is no longer on the menu. Reload the till.' })
    return { product, qty: line.qty }
  })

  const discount = input.discountId
    ? await db.select({ id: schema.barDiscounts.id, percent: schema.barDiscounts.percent })
      .from(schema.barDiscounts)
      .where(and(eq(schema.barDiscounts.id, input.discountId), eq(schema.barDiscounts.status, 'ACTIVE')))
      .get() ?? null
    : null

  const built = buildTransaction({
    source: 'TILL',
    tender: 'CARD',
    takenByUserId: user.id,
    barSessionId: session?.id ?? null,
    ticketLines,
    barLines,
    discount,
  })

  if (built.totalPence !== input.expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen showed ${formatPence(input.expectedTotalPence)} but this comes to ${formatPence(built.totalPence)}. Reload before taking payment.`,
    })
  }

  // Stock leaves the shelf in the same batch as the money arrives (docs/13 §3.2).
  const movements = movementStatements(basketMovements(depleting, {
    kind: 'SALE',
    refTable: 'transactions',
    refId: built.transactionId,
    createdByUserId: user.id,
  }))

  // Collections, the money record and the stock, together or not at all (ADR-0023).
  await db.batch([...collections, ...built.statements, ...movements] as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])

  return {
    transactionId: built.transactionId,
    totalPence: built.totalPence,
    barSubtotal: built.barSubtotal,
    ticketSubtotal: built.ticketSubtotal,
    discountPence: built.discountPence,
  }
})

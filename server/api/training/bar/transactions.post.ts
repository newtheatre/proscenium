import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { trainingBooking } from '~~/shared/utils/trainingScenario'

const bodySchema = z.object({
  tender: z.literal('CARD'),
  barItems: z.array(z.object({
    productId: z.string().trim().min(1),
    qty: z.coerce.number().int().min(1).max(99),
    choices: z.array(z.object({
      itemId: z.string().trim().min(1),
      productId: z.string().trim().min(1),
    })).max(8).optional().default([]),
  })).max(40).optional().default([]),
  reservationIds: z.array(z.string().trim().min(1)).max(10).optional().default([]),
  discountId: z.string().trim().min(1).nullable().optional(),
  expectedTotalPence: z.coerce.number().int().min(0),
})

/**
 * POST /api/training/bar/transactions: the same arithmetic, none of the
 * persistence. Writes one event and nothing else (ADR-0032).
 */
export default defineEventHandler(async (event) => {
  const { run, user } = await requireRun(event, 'bar-till')
  const input = await readValidatedBody(event, bodySchema.parse)

  if (!input.barItems.length && !input.reservationIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing in the basket.' })
  }

  const prices = await currentPrices(input.barItems.map(item => item.productId))
  const barLines = input.barItems.map((item) => {
    const price = prices.get(item.productId)
    if (!price) throw createError({ statusCode: 409, statusMessage: 'One of those has no price set. Reload the till.' })
    return { productId: item.productId, qty: item.qty, choices: item.choices, unitPricePence: price.pricePence, priceId: price.priceId }
  })

  // Fixture bookings only. A real reference typed in here finds nothing,
  // which is what makes the sandbox incapable of touching a booking.
  const ticketLines = []
  for (const reservationId of input.reservationIds) {
    const booking = trainingBooking(reservationId)
    if (!booking) throw createError({ statusCode: 404, statusMessage: 'That booking no longer exists.' })

    const standing = bookingStanding(booking)
    if (standing.state === 'PAID') {
      throw createError({ statusCode: 409, statusMessage: 'That booking has already been paid. Reload the till.' })
    }
    ticketLines.push({
      reservationId,
      performanceId: booking.performanceId,
      amountPence: standing.amountOwedPence,
    })
  }

  const rules = barLines.length ? await depletionRules() : new Map()
  const depleting = barLines.map((line) => {
    const product = rules.get(line.productId)
    if (!product) throw createError({ statusCode: 409, statusMessage: 'One of those is no longer on the menu. Reload the till.' })
    const resolved = resolveLine(product, line.qty, line.choices, rules)
    if (!resolved.ok) throw createError({ statusCode: 409, statusMessage: resolved.error })
    return resolved.line
  })

  const discount = input.discountId
    ? await db.select({ id: schema.barDiscounts.id, percent: schema.barDiscounts.percent })
      .from(schema.barDiscounts)
      .where(and(eq(schema.barDiscounts.id, input.discountId), eq(schema.barDiscounts.status, 'ACTIVE')))
      .get() ?? null
    : null

  // The same function that computes the real figure, so the number a trainee
  // is told to type into SumUp is the number they will type for real.
  const built = buildTransaction({
    source: 'TILL',
    tender: 'CARD',
    takenByUserId: user.id,
    barSessionId: null,
    ticketLines,
    barLines: barLines.map((line, i) => ({ ...line, choices: depleting[i]!.choices })),
    discount,
  })

  if (built.totalPence !== input.expectedTotalPence) {
    throw createError({
      statusCode: 409,
      statusMessage: `The screen showed ${formatPence(input.expectedTotalPence)} but this comes to ${formatPence(built.totalPence)}. Reload before taking payment.`,
    })
  }

  // What stock *would* have left the shelf, computed and then thrown away:
  // built.statements and these movements are never executed.
  const movements = basketMovements(depleting, {
    kind: 'SALE',
    refTable: 'training',
    refId: built.transactionId,
    createdByUserId: user.id,
  })

  await recordEvent(run.id, 'SALE', {
    totalPence: built.totalPence,
    barSubtotal: built.barSubtotal,
    ticketSubtotal: built.ticketSubtotal,
    discountPence: built.discountPence,
    lines: barLines.length + ticketLines.length,
    wouldDeplete: movements.length,
  })

  return {
    transactionId: built.transactionId,
    totalPence: built.totalPence,
    barSubtotal: built.barSubtotal,
    ticketSubtotal: built.ticketSubtotal,
    discountPence: built.discountPence,
  }
})

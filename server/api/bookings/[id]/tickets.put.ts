import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod/v4'

/**
 * PUT /api/bookings/:id/tickets
 *
 * Customer self-service edit of their own booking's ticket composition (the
 * logged-in owner, or a guest presenting a valid access token).
 *
 * Same desired-quantity diff as the staff endpoint, but with self-service
 * guards: the booking must be PENDING and the performance ON_SALE and in the
 * future, only active ticket types may be added, capacity is enforced, and the
 * booking cannot be emptied (cancel it instead).
 */
const bodySchema = z.object({
  tickets: z.array(z.object({
    ticketTypeId: z.string().min(1),
    quantity: z.int().min(0).max(10),
  })).min(1),
}).refine(
  // The handler treats each entry as the desired TOTAL for that type and reads
  // the current count from a map it never updates, so two entries for one type
  // each computed against the original count and the quantities compounded —
  // "10 then 10" inserted 20. A repeated type is a client bug either way.
  data => new Set(data.tickets.map(t => t.ticketTypeId)).size === data.tickets.length,
  { message: 'Each ticket type may only appear once' },
)

export default defineEventHandler(async (event) => {
  const idOrRef = getRouterParam(event, 'id')
  if (!idOrRef) throw createError({ statusCode: 400, statusMessage: 'Booking ID is required' })

  const booking = await requireBookingAccess(event, idOrRef)

  // Same rule as the staff route, from one place: editable until collected,
  // refundable only after. See server/utils/reservationLifecycle.ts.
  assertTicketsEditable(booking.status)
  if (booking.performance.status !== 'ON_SALE') {
    throw createError({ statusCode: 400, statusMessage: 'This performance is no longer open for changes' })
  }
  // Honours bookingClosesHoursBefore, so a customer cannot add tickets after
  // front-of-house has stopped counting on online numbers.
  assertBookingOpen(booking.performance)

  const body = await readValidatedBody(event, bodySchema.parse)
  const { performanceId } = booking
  const showId = booking.performance.showId
  const requestedTypeIds = body.tickets.map(t => t.ticketTypeId)

  // Only active types may be booked/added by a customer.
  const priceCtx = await loadTicketPriceContext(requestedTypeIds, showId, performanceId)
  validateTicketTypesActive(requestedTypeIds, priceCtx)

  // Current active (non-refunded) tickets for the whole reservation.
  const allActive = await db
    .select()
    .from(schema.tickets)
    .where(and(
      eq(schema.tickets.reservationId, booking.id),
      isNull(schema.tickets.refundedAt),
    ))

  const byType = new Map<string, typeof allActive>()
  for (const ticket of allActive.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))) {
    if (!byType.has(ticket.ticketTypeId)) byType.set(ticket.ticketTypeId, [])
    byType.get(ticket.ticketTypeId)!.push(ticket)
  }

  // ── Apply diff (requested types only; others untouched) ────────────────────
  const toDelete: string[] = []
  const toInsert: Array<{ reservationId: string, performanceId: string, ticketTypeId: string, pricePaid: number }> = []

  for (const { ticketTypeId, quantity } of body.tickets) {
    const current = byType.get(ticketTypeId) ?? []
    if (quantity > current.length) {
      for (let i = 0; i < quantity - current.length; i++) {
        toInsert.push({
          reservationId: booking.id,
          performanceId,
          ticketTypeId,
          pricePaid: resolveEffectivePrice(ticketTypeId, priceCtx),
        })
      }
    }
    else if (quantity < current.length) {
      toDelete.push(...current.slice(-(current.length - quantity)).map(t => t.id))
    }
  }

  // A booking must keep at least one ticket — to remove everything, cancel it.
  if (allActive.length + toInsert.length - toDelete.length < 1) {
    throw createError({ statusCode: 400, statusMessage: 'A booking must have at least one ticket. Cancel it instead.' })
  }

  await assertCapacity(performanceId, toInsert.length - toDelete.length)

  const del = toDelete.length > 0
    ? db.delete(schema.tickets).where(inArray(schema.tickets.id, toDelete))
    : null
  const ins = toInsert.length > 0
    ? db.insert(schema.tickets).values(toInsert)
    : null

  if (del && ins) await db.batch([del, ins])
  else if (del) await del
  else if (ins) await ins

  return { updated: true }
})

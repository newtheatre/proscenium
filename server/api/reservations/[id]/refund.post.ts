import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod/v4'
import { refundTicket } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  ticketTypeId: z.string().min(1),
  // Bounded because `quantity` becomes the length of an `inArray` id list and D1
  // binds at most 100 parameters (ADR-0006).
  quantity: z.int().min(1).max(50),
})

/**
 * POST /api/reservations/:id/refund — stamp `refundedAt` on `quantity` active
 * tickets of a type.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, refundTicket)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Reservation ID is required' })

  const { ticketTypeId, quantity } = await readValidatedBody(event, bodySchema.parse)

  const reservation = await db
    .select({ status: schema.reservations.status })
    .from(schema.reservations)
    .where(eq(schema.reservations.id, id))
    .get()

  if (!reservation) throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })

  // Only a collected booking has money to give back — see reservationLifecycle.
  assertRefundable(reservation.status)

  const active = await db
    .select()
    .from(schema.tickets)
    .where(
      and(
        eq(schema.tickets.reservationId, id),
        eq(schema.tickets.ticketTypeId, ticketTypeId),
        isNull(schema.tickets.refundedAt),
      ),
    )

  if (active.length < quantity) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Not enough active tickets of this type to refund',
    })
  }

  // Refund the newest tickets first, consistent with how removals pick tickets.
  const toRefund = active
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, quantity)
    .map(t => t.id)

  // `refundedAt IS NULL` in the WHERE, not only the SELECT: two concurrent
  // refunds would otherwise both report success (ADR-0011).
  const refunded = await db
    .update(schema.tickets)
    .set({ refundedAt: new Date() })
    .where(and(
      inArray(schema.tickets.id, toRefund),
      isNull(schema.tickets.refundedAt),
    ))
    .returning({ id: schema.tickets.id })

  if (refunded.length < quantity) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Some of those tickets were refunded by someone else just now. Reload the reservation and check the totals before refunding again.',
    })
  }

  return { refunded: refunded.length }
})

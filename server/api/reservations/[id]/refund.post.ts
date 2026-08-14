import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod/v4'
import { refundTicket } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  ticketTypeId: z.string().min(1),
  // Bounded because `quantity` becomes the length of an `inArray` id list and
  // D1 binds at most 100 parameters per statement. Refunding more than 50
  // tickets of one type in a single call is a data-repair job, not a box-office
  // action.
  quantity: z.int().min(1).max(50),
})

/**
 * POST /api/reservations/:id/refund
 *
 * Marks `quantity` active (non-refunded) tickets of a given type on the
 * reservation as refunded by stamping `refundedAt`. Refunded tickets are
 * retained for audit but excluded from capacity and revenue. Admin/Manager only.
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
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .slice(0, quantity)
    .map(t => t.id)

  // `refundedAt IS NULL` in the WHERE, not only in the SELECT above: read and
  // write are separate statements, so two concurrent refunds would both report
  // success while one stamp lands — cash out twice, recorded once. `returning()`
  // then reports what this call actually refunded (ADR-0011).
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

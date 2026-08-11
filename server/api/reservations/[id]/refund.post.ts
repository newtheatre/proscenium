import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod/v4'
import { refundTicket } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  ticketTypeId: z.string().min(1),
  quantity: z.int().min(1),
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

  await db
    .update(schema.tickets)
    .set({ refundedAt: new Date() })
    .where(inArray(schema.tickets.id, toRefund))

  return { refunded: toRefund.length }
})

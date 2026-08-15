import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { updateReservation } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  status: z.enum(['PENDING', 'COLLECTED', 'DOOR', 'CANCELLED', 'NO_SHOW']).optional(),
  cancelledBy: z.enum(['CUSTOMER', 'STAFF']).optional().nullable(),
  customerNotes: z.string().optional().nullable(),
  staffNotes: z.string().optional().nullable(),
}).refine(
  data => !(data.status === 'CANCELLED' && !data.cancelledBy),
  { message: 'cancelledBy is required when status is CANCELLED' },
)

/** PUT /api/reservations/:id — update a reservation. Staff only. */
export default defineEventHandler(async (event) => {
  await authorize(event, updateReservation)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Reservation ID is required' })

  const existing = await db.select().from(schema.reservations).where(eq(schema.reservations.id, id)).get()
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })

  const body = await readValidatedBody(event, bodySchema.parse)

  // Reinstating re-takes seats that cancelling released, so it must pass the
  // same capacity check a fresh booking would (ADR-0007).
  if (body.status && body.status !== existing.status
    && releasesSeats(existing.status) && !releasesSeats(body.status)) {
    const seats = await countReservationSeats(id)
    await assertCapacity(existing.performanceId, seats)
  }

  const updateData: Partial<typeof schema.reservations.$inferInsert> = {}
  if (body.status !== undefined) updateData.status = body.status
  if (body.cancelledBy !== undefined) updateData.cancelledBy = body.cancelledBy ?? null
  if (body.customerNotes !== undefined) updateData.customerNotes = body.customerNotes ?? null
  if (body.staffNotes !== undefined) updateData.staffNotes = body.staffNotes ?? null

  // If status is being set away from CANCELLED, clear cancelledBy
  if (body.status && body.status !== 'CANCELLED' && !('cancelledBy' in body)) {
    updateData.cancelledBy = null
  }

  if (Object.keys(updateData).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid fields provided for update' })
  }

  const [updated] = await db.update(schema.reservations).set(updateData).where(eq(schema.reservations.id, id)).returning()

  // Send cancellation email if status was changed to CANCELLED
  if (body.status === 'CANCELLED' && existing.status !== 'CANCELLED') {
    // Drizzle does not infer the relations on this nested query, so type the
    // result explicitly (same pattern as the booking handlers).
    const reservation = await db.query.reservations.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.id, id),
      with: {
        user: { columns: { id: true, name: true, email: true } },
        performance: {
          with: {
            show: { columns: { id: true, title: true, slug: true } },
            venue: { columns: { id: true, name: true } },
          },
        },
        tickets: {
          with: { ticketType: { columns: { id: true, name: true } } },
        },
      },
    }) as {
      id: string
      bookingRef: string
      user: { name: string, email: string }
      performance: {
        startsAt: Date
        show: { title: string, slug: string }
        venue: { name: string }
      }
      tickets: Array<{ id: string, pricePaid: number, ticketType: { id: string, name: string } }>
    } | undefined

    if (reservation) {
      const emailPromise = sendBookingCancellationEmail({
        bookingId: reservation.id,
        bookingRef: reservation.bookingRef,
        customerName: reservation.user.name,
        customerEmail: reservation.user.email,
        showTitle: reservation.performance.show.title,
        showSlug: reservation.performance.show.slug,
        venueName: reservation.performance.venue.name,
        performanceDate: reservation.performance.startsAt,
        tickets: reservation.tickets,
      }).catch(err => console.error('[Email] Failed to send cancellation email:', err))

      // Keep the Cloudflare Worker alive until the email is sent
      event.context.cloudflare?.context.waitUntil(emailPromise)
    }
  }

  return updated
})

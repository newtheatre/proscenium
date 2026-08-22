import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { sendBookingCancellationEmail } from '~~/server/utils/email'

/**
 * POST /api/bookings/:id/cancel Lets a customer cancel their own booking:
 * the logged-in owner, or a guest presenting a valid access token.
 */
export default defineEventHandler(async (event) => {
  const idOrRef = getRouterParam(event, 'id')
  if (!idOrRef) throw createError({ statusCode: 400, statusMessage: 'Booking ID is required' })

  const booking = await requireBookingAccess(event, idOrRef)

  if (booking.status !== 'PENDING') {
    throw createError({ statusCode: 400, statusMessage: 'Only a booking that has not yet been collected can be cancelled' })
  }
  if (booking.performance.startsAt < new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'This performance has already started' })
  }

  await db
    .update(schema.reservations)
    .set({ status: 'CANCELLED', cancelledBy: 'CUSTOMER' })
    .where(eq(schema.reservations.id, booking.id))

  // Send the cancellation email (best-effort; kept alive on the Worker).
  const full = await db.query.reservations.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.id, booking.id),
    with: {
      user: { columns: { name: true, email: true } },
      performance: {
        with: {
          show: { columns: { title: true, slug: true } },
          venue: { columns: { name: true } },
        },
      },
      tickets: { with: { ticketType: { columns: { id: true, name: true } } } },
    },
  }) as {
    bookingRef: string
    user: { name: string, email: string }
    performance: {
      startsAt: Date
      show: { title: string, slug: string }
      venue: { name: string }
    }
    tickets: Array<{ id: string, pricePaid: number, ticketType: { id: string, name: string } }>
  } | undefined

  if (full) {
    const emailPromise = sendBookingCancellationEmail({
      bookingId: booking.id,
      bookingRef: full.bookingRef,
      customerName: full.user.name,
      customerEmail: full.user.email,
      showTitle: full.performance.show.title,
      showSlug: full.performance.show.slug,
      venueName: full.performance.venue.name,
      performanceDate: full.performance.startsAt,
      tickets: full.tickets,
    }).catch((err: unknown) => console.error('[Email] Failed to send cancellation email:', err))
    event.context.cloudflare?.context.waitUntil(emailPromise)
  }

  return { status: 'CANCELLED' }
})

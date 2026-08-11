import { db } from '@nuxthub/db'

/**
 * GET /api/bookings/:id — get a booking by its id or its booking reference.
 *
 * Confirmation emails link with the short bookingRef, so the `:id` segment may
 * be either the nanoid primary key or the six-character reference.
 *
 * Accessible to the booking owner (logged in) or staff, or to a guest that
 * supplies the matching booking reference as `?ref=`.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Booking ID is required' })
  }

  const booking = await db.query.reservations.findFirst({
    where: (r, { eq, or }) => or(eq(r.id, id), eq(r.bookingRef, id)),
    with: {
      user: { columns: { id: true, name: true, email: true } },
      performance: {
        with: {
          show: { columns: { id: true, title: true, slug: true, posterUrl: true } },
          venue: { columns: { id: true, name: true, address: true } },
        },
      },
      tickets: {
        with: {
          ticketType: { columns: { id: true, name: true } },
        },
      },
    },
  })

  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  }

  // Allow access for: the booking owner, or staff
  const session = await getUserSession(event)
  const sessionUser = session?.user

  if (sessionUser) {
    const isOwner = sessionUser.id === booking.userId
    const isStaff = sessionUser.roles?.some((r: string) => ['ADMIN', 'MANAGER', 'BOX_OFFICE'].includes(r))
    if (isOwner || isStaff) return booking
  }

  // For guest access, require the booking ref as a query parameter
  const query = getQuery(event)
  if (query.ref && query.ref === booking.bookingRef) {
    return booking
  }

  throw createError({ statusCode: 403, statusMessage: 'You do not have access to this booking' })
})

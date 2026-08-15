import { db } from '@nuxthub/db'
import { isStaff } from '~~/shared/utils/abilities'

/**
 * GET /api/bookings/:id — get a booking by its id or its booking reference.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Booking ID is required' })
  }

  // Customer-facing shape — this endpoint is reachable without a session, so it
  // must not return internal columns.
  const booking = await db.query.reservations.findFirst({
    where: (r, { eq, or }) => or(eq(r.id, id), eq(r.bookingRef, id)),
    columns: { ...reservationCustomerColumns, userId: true },
    with: reservationCustomerWith,
  })

  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
  }

  // userId is only needed to decide access; it is not part of the response.
  const { userId, ...customerBooking } = booking

  // Owner or staff. A stale session keeps its identity but loses its roles, so
  // the owner branch works while the staff branch fails closed (ADR-0008).
  const sessionUser = await sessionUserForAuthorization(event)

  if (sessionUser) {
    const isOwner = sessionUser.id === userId
    // isStaff(), not a literal role list: session roles are app-scoped, so
    // comparing against bare 'ADMIN' never matches.
    if (isOwner || isStaff(sessionUser)) return customerBooking
  }

  // A signed token scoped to this booking. The booking reference is no longer
  // accepted — it is quoted aloud and printed on emails (ADR-0009).
  if (await hasBookingToken(event, booking.id)) {
    return customerBooking
  }

  throw createError({ statusCode: 403, statusMessage: 'You do not have access to this booking' })
})

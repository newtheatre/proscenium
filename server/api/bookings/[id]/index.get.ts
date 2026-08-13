import { db } from '@nuxthub/db'
import { isStaff } from '~~/shared/utils/abilities'

/**
 * GET /api/bookings/:id — get a booking by its id or its booking reference.
 *
 * Confirmation emails link with the short bookingRef, so the `:id` segment may
 * be either the nanoid primary key or the six-character reference.
 *
 * Accessible to the booking owner (logged in) or staff, or to a guest that
 * supplies a valid access token as `?t=`.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Booking ID is required' })
  }

  // Customer-facing shape: this endpoint is reachable by anyone holding the
  // booking reference, so it must not return internal columns — see
  // reservationCustomerColumns. `userId` is still needed for the owner check
  // below, so it is selected here and stripped from the response.
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

  // Allow access for: the booking owner, or staff. A stale session keeps its
  // identity but loses its roles, so the owner branch still works while the
  // staff branch — which returns any booking — fails closed until refresh.
  const sessionUser = await sessionUserForAuthorization(event)

  if (sessionUser) {
    const isOwner = sessionUser.id === userId
    // isStaff() from the abilities layer, not a literal role list: session roles
    // are app-scoped ('proscenium:ADMIN'), so comparing against bare 'ADMIN'
    // never matched and this branch silently never fired.
    if (isOwner || isStaff(sessionUser)) return customerBooking
  }

  // Guest access: a signed token scoped to this booking, from `?t=` or the
  // cookie. The booking reference is no longer accepted — it is quoted aloud at
  // the box office and printed on every email, so it cannot also be the key.
  if (await hasBookingToken(event, booking.id)) {
    return customerBooking
  }

  throw createError({ statusCode: 403, statusMessage: 'You do not have access to this booking' })
})

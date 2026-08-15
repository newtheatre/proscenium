import { db } from '@nuxthub/db'
import { isStaff, readReservation } from '~~/shared/utils/abilities'

/**
 * GET /api/reservations/:id — one reservation.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Reservation ID is required' })

  // Non-throwing, and drops roles from a stale session, so a staff member
  // needing refresh gets the customer shape rather than internal notes.
  const actor = await sessionUserForAuthorization(event)
  const staff = actor ? isStaff(actor) : false

  const reservation = staff
    ? await db.query.reservations.findFirst({
        where: (r, { eq }) => eq(r.id, id),
        with: reservationDetailWith,
      })
    : await db.query.reservations.findFirst({
        where: (r, { eq }) => eq(r.id, id),
        // `userId` is still needed for the owner check below; it is the
        // customer's own id, not private to them.
        columns: { ...reservationCustomerColumns, userId: true },
        with: reservationCustomerWith,
      })

  if (!reservation) {
    throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })
  }

  await authorize(event, readReservation, { userId: reservation.userId })

  return reservation
})

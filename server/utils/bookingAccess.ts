import { db, schema } from '@nuxthub/db'
import { eq, or } from 'drizzle-orm'
import type { H3Event } from 'h3'

export interface BookingAccess {
  id: string
  bookingRef: string
  userId: string
  status: 'PENDING' | 'COLLECTED' | 'DOOR' | 'CANCELLED' | 'NO_SHOW'
  performanceId: string
  performance: {
    startsAt: Date
    status: 'DRAFT' | 'ON_SALE' | 'CANCELLED'
    showId: string
  }
}

/**
 * Load a booking by its id or bookingRef and assert the caller may act on it:
 * the logged-in owner or staff, or a guest presenting the matching `?ref=`.
 *
 * Returns the reservation plus its performance's start time, status and show —
 * enough for the self-service guards. Throws 404 if unknown, 403 if the caller
 * is not authorised.
 */
export async function requireBookingAccess(event: H3Event, idOrRef: string): Promise<BookingAccess> {
  const booking = await db
    .select({
      id: schema.reservations.id,
      bookingRef: schema.reservations.bookingRef,
      userId: schema.reservations.userId,
      status: schema.reservations.status,
      performanceId: schema.reservations.performanceId,
    })
    .from(schema.reservations)
    .where(or(eq(schema.reservations.id, idOrRef), eq(schema.reservations.bookingRef, idOrRef)))
    .get()

  if (!booking) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })

  const session = await getUserSession(event)
  const sessionUser = session?.user
  const isOwner = sessionUser?.id === booking.userId
  const isStaff = sessionUser?.roles?.some((r: string) => ['ADMIN', 'MANAGER', 'BOX_OFFICE'].includes(r)) ?? false
  const query = getQuery(event)
  const hasRef = !!query.ref && query.ref === booking.bookingRef

  if (!isOwner && !isStaff && !hasRef) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have access to this booking' })
  }

  const performance = await db
    .select({
      startsAt: schema.performances.startsAt,
      status: schema.performances.status,
      showId: schema.performances.showId,
    })
    .from(schema.performances)
    .where(eq(schema.performances.id, booking.performanceId))
    .get()

  if (!performance) throw createError({ statusCode: 500, statusMessage: 'Performance not found' })

  return { ...booking, performance }
}

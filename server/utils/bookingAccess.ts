import { db, schema } from '@nuxthub/db'
import { eq, or } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * Cookie carrying a booking reference for a guest who arrived from a legacy
 * `/cancel/:code` link, so the reference does not have to travel in the URL.
 *
 * Scoped to the booking it was issued for: the value is `<bookingId>.<ref>` and
 * the id must match the booking being accessed, so a cookie picked up from one
 * booking cannot be replayed against another.
 */
export const BOOKING_REF_COOKIE = 'nnt_booking_ref'

/** How long a guest has to act on a legacy link before it must be followed again. */
export const BOOKING_REF_COOKIE_MAX_AGE = 60 * 30

export function setBookingRefCookie(event: H3Event, bookingId: string, bookingRef: string): void {
  setCookie(event, BOOKING_REF_COOKIE, `${bookingId}.${bookingRef}`, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/',
    maxAge: BOOKING_REF_COOKIE_MAX_AGE,
  })
}

/**
 * The booking reference the caller is presenting, from `?ref=` or from the
 * cookie set by the legacy-link redirect. Returns undefined if neither is
 * present or the cookie was issued for a different booking.
 */
export function presentedBookingRef(event: H3Event, bookingId: string): string | undefined {
  const query = getQuery(event)
  if (typeof query.ref === 'string' && query.ref) return query.ref

  const cookie = getCookie(event, BOOKING_REF_COOKIE)
  if (!cookie) return undefined

  const separator = cookie.indexOf('.')
  if (separator === -1) return undefined
  if (cookie.slice(0, separator) !== bookingId) return undefined

  return cookie.slice(separator + 1) || undefined
}

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

  // Verified rather than raw: `roles` below is an authorisation decision, so a
  // revoked session must not still satisfy it.
  const sessionUser = await getVerifiedSessionUser(event)
  const isOwner = sessionUser?.id === booking.userId
  const isStaff = sessionUser?.roles?.some((r: string) => ['ADMIN', 'MANAGER', 'BOX_OFFICE'].includes(r)) ?? false
  const hasRef = presentedBookingRef(event, booking.id) === booking.bookingRef

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

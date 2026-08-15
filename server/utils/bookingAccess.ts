import { db, schema } from '@nuxthub/db'
import { eq, or } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { isStaff } from '~~/shared/utils/abilities'

/**
 * A token left in the URL reaches browser history, intermediary logs and the
 * Referer of every outbound link, so move it to a cookie (ADR-0009).
 */
export const BOOKING_TOKEN_COOKIE = 'nnt_booking_token'

/** Long enough to read the page and act on it, short enough not to linger. */
export const BOOKING_TOKEN_COOKIE_MAX_AGE = 60 * 60

export function setBookingTokenCookie(event: H3Event, token: string): void {
  setCookie(event, BOOKING_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/',
    maxAge: BOOKING_TOKEN_COOKIE_MAX_AGE,
  })
}

/**
 * Whether the caller presents a valid access token for this booking, from `?t=`
 * or from the cookie. `?ref=` is deliberately not accepted (ADR-0009).
 */
export async function hasBookingToken(event: H3Event, bookingId: string): Promise<boolean> {
  const query = getQuery(event)
  const fromQuery = typeof query.t === 'string' ? query.t : undefined

  if (fromQuery && await verifyBookingToken(fromQuery, bookingId)) {
    // Hand it off to a cookie so the page can drop it from the URL.
    setBookingTokenCookie(event, fromQuery)
    return true
  }

  const fromCookie = getCookie(event, BOOKING_TOKEN_COOKIE)
  if (fromCookie && await verifyBookingToken(fromCookie, bookingId)) return true

  return false
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
    bookingClosesHoursBefore: number | null
  }
}

/**
 * Load a booking by id or bookingRef and assert the caller may act on it:
 * owner, staff, or a valid access token. 404 if unknown, 403 if not.
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

  // A stale session must not satisfy the role check but must still satisfy the
  // owner check, which is why the resolver drops roles (ADR-0008).
  const sessionUser = await sessionUserForAuthorization(event)
  const isOwner = sessionUser?.id === booking.userId
  // isStaff(), not a literal role list: roles arrive app-scoped, so matching
  // bare 'BOX_OFFICE' is always false.
  const staff = sessionUser ? isStaff(sessionUser) : false
  const hasToken = await hasBookingToken(event, booking.id)

  if (!isOwner && !staff && !hasToken) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have access to this booking' })
  }

  const performance = await db
    .select({
      startsAt: schema.performances.startsAt,
      status: schema.performances.status,
      showId: schema.performances.showId,
      bookingClosesHoursBefore: schema.performances.bookingClosesHoursBefore,
    })
    .from(schema.performances)
    .where(eq(schema.performances.id, booking.performanceId))
    .get()

  if (!performance) throw createError({ statusCode: 500, statusMessage: 'Performance not found' })

  return { ...booking, performance }
}

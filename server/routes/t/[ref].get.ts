import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

/**
 * GET /t/:ref: the short booking handle, printed as a QR. Resolves and
 * redirects; the reference itself grants nothing (ADR-0009).
 */
export default defineEventHandler(async (event) => {
  const ref = getRouterParam(event, 'ref')?.trim().toUpperCase()
  if (!ref) throw createError({ statusCode: 404, statusMessage: 'Unknown booking reference' })

  const booking = await db.select({
    id: schema.reservations.id,
    bookingRef: schema.reservations.bookingRef,
    showSlug: schema.shows.slug,
  })
    .from(schema.reservations)
    .innerJoin(schema.performances, eq(schema.reservations.performanceId, schema.performances.id))
    .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .where(eq(schema.reservations.bookingRef, ref))
    .get()

  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: 'We could not find a booking with that reference.' })
  }

  // Straight to the cookie, so it never reaches the destination URL, the
  // history or a Referer (ADR-0009). Invalid is ignored: the page says it better.
  const token = getQuery(event).t
  if (typeof token === 'string' && await verifyBookingToken(token, booking.id)) {
    setBookingTokenCookie(event, token)
  }

  return sendRedirect(event, `/whats-on/${booking.showSlug}/booking/${booking.bookingRef}`, 302)
})

import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

/**
 * GET /cancel/:code — redirect a legacy ticketing link to its Proscenium booking.
 *
 * Every confirmation email the Heroku/Django box office sent between 2016 and
 * 2025 carried a link of the form:
 *
 *   https://ticketing.newtheatre.org.uk/cancel/<16-hex-code>/
 *
 * That code was the reservation's public handle — the customer's only
 * self-service action, and the value front-of-house typed to collect. The
 * import keeps it as `reservations.legacyRef`, so those links can resolve to
 * the imported booking instead of dying.
 *
 * The legacy code is itself the shared secret, exactly as the new `?ref=` is,
 * so handing one off for the other preserves the original level of access and
 * the customer keeps the same self-service they had before.
 *
 * Note this path only receives traffic once `ticketing.newtheatre.org.uk` is
 * pointed at this Worker (or a redirect rule forwards it). The legacy app is
 * still serving these URLs today.
 */
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')?.trim()

  // Legacy codes are 16 lowercase hex characters. Reject anything else rather
  // than putting arbitrary input through a lookup.
  if (!code || !/^[0-9a-f]{16}$/i.test(code)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'That booking link is not valid. Please contact the box office.',
    })
  }

  const booking = await db
    .select({
      id: schema.reservations.id,
      bookingRef: schema.reservations.bookingRef,
      performanceId: schema.reservations.performanceId,
    })
    .from(schema.reservations)
    .where(eq(schema.reservations.legacyRef, code.toLowerCase()))
    .get()

  if (!booking) {
    throw createError({
      statusCode: 404,
      statusMessage: 'We could not find that booking. Please contact the box office.',
    })
  }

  const performance = await db
    .select({ showId: schema.performances.showId })
    .from(schema.performances)
    .where(eq(schema.performances.id, booking.performanceId))
    .get()

  const show = performance
    ? await db
        .select({ slug: schema.shows.slug })
        .from(schema.shows)
        .where(eq(schema.shows.id, performance.showId))
        .get()
    : undefined

  if (!show) {
    throw createError({
      statusCode: 404,
      statusMessage: 'We could not find that booking. Please contact the box office.',
    })
  }

  // The reference goes in a short-lived, host-only cookie rather than the
  // redirect target's query string. In the query it would be written into
  // browser history, into any intermediary's logs, and into the Referer header
  // of every outbound link on the booking page — for a value that is itself the
  // access token.
  setBookingRefCookie(event, booking.id, booking.bookingRef)

  // 302, not 301: the mapping is stable, but a permanent redirect is cached
  // indefinitely by browsers and intermediaries, which would pin the response
  // (and previously the secret in its Location header) beyond our reach. This
  // also has to stay uncacheable because the response now sets a cookie.
  setResponseHeader(event, 'Cache-Control', 'no-store')

  return sendRedirect(event, `/whats-on/${show.slug}/booking/${booking.id}`, 302)
})

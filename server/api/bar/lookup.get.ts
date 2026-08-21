import { db, schema } from '@nuxthub/db'
import { and, asc, eq, inArray, ne, or } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const querySchema = z.object({ q: z.string().trim().min(2).max(100) })
const REF = /^[A-Z0-9]{6}$/i

/**
 * GET /api/bar/lookup — find a booking to take payment for. Deliberately NOT
 * night-scoped: paying in advance for Saturday is a designed case (§2.2).
 */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const night = await requireBarScope(user)
  const { q } = await getValidatedQuery(event, querySchema.parse)

  const term = q.trim()
  const matchingUsers = db.select({ id: schema.users.id })
    .from(schema.users)
    .where(or(likeInsensitive(schema.users.name, term), likeInsensitive(schema.users.email, term)))

  const rows = await db.select({
    id: schema.reservations.id,
    bookingRef: schema.reservations.bookingRef,
    status: schema.reservations.status,
    customerName: schema.users.name,
    performanceId: schema.performances.id,
    startsAt: schema.performances.startsAt,
    showTitle: schema.shows.title,
    venueName: schema.venues.name,
  })
    .from(schema.reservations)
    .innerJoin(schema.users, eq(schema.reservations.userId, schema.users.id))
    .innerJoin(schema.performances, eq(schema.reservations.performanceId, schema.performances.id))
    .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .innerJoin(schema.venues, eq(schema.performances.venueId, schema.venues.id))
    .where(and(
      ne(schema.reservations.status, 'CANCELLED'),
      REF.test(term)
        ? eq(schema.reservations.bookingRef, term.toUpperCase())
        : inArray(schema.reservations.userId, matchingUsers),
    ))
    .orderBy(asc(schema.performances.startsAt))
    .limit(10)

  if (!rows.length) return []

  const tonightStart = validityStart(night)
  const tonightEnd = validityEnd(night)

  return Promise.all(rows.map(async (reservation) => {
    const owed = await amountOwedFor(reservation.id)
    return {
      id: reservation.id,
      bookingRef: reservation.bookingRef,
      status: reservation.status,
      // A first name is enough to check you have the right person.
      firstName: reservation.customerName.split(' ')[0] ?? '',
      performance: {
        id: reservation.performanceId,
        startsAt: reservation.startsAt,
        showTitle: reservation.showTitle,
        venueName: reservation.venueName,
        /** Flagged on the card, and still payable (docs/13 §4.1). */
        isTonight: reservation.startsAt >= tonightStart && reservation.startsAt <= tonightEnd,
      },
      amountOwedPence: isCollected(reservation.status) ? 0 : owed?.amountPence ?? 0,
      alreadyPaid: isCollected(reservation.status),
    }
  }))
})

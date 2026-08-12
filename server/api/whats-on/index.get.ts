import { db, schema } from '@nuxthub/db'
import { and, asc, count, eq, gt, inArray, isNull, min } from 'drizzle-orm'

/**
 * GET /api/whats-on — list published shows with upcoming on-sale performances.
 *
 * Public endpoint — no authentication required, and the highest-traffic one in
 * the app (it backs both the homepage and What's On).
 *
 * It used to load all 498 published shows with their performances and then
 * discard the historical majority in JavaScript, reading a couple of thousand
 * rows per anonymous hit to return the handful of shows actually on sale. The
 * filtering now happens in SQL, so only the current shows are read at all.
 */
export default defineEventHandler(async (event) => {
  const now = new Date()

  // Set before any return, including the empty one below. Placed after it, the
  // header was skipped whenever nothing was on sale — which is the cheapest
  // response of all to cache, and the state the site sits in between seasons.
  //
  // Public and slow-changing, so let Cloudflare serve it from the edge. The one
  // thing that moves quickly is ticketsSold, and a minute-old sold-out badge is
  // harmless: capacity is enforced when the booking is written, not from this
  // response.
  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')

  // Which published shows have at least one future ON_SALE performance, and when
  // does each one open? Ordering by the earliest performance is what the list
  // wants, and doing it here means the rest of the work is already narrowed.
  const candidates = await db
    .select({
      showId: schema.performances.showId,
      earliest: min(schema.performances.startsAt),
    })
    .from(schema.performances)
    .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
    .where(and(
      eq(schema.shows.status, 'PUBLISHED'),
      eq(schema.performances.status, 'ON_SALE'),
      gt(schema.performances.startsAt, now),
    ))
    .groupBy(schema.performances.showId)
    .orderBy(asc(min(schema.performances.startsAt)))

  if (candidates.length === 0) return []

  const orderedShowIds = candidates.map(c => c.showId)

  // A subquery rather than the id list, for the same 100-parameter reason as
  // below — a busy season could put more than 100 shows on sale at once.
  const showsOnSale = db
    .select({ id: schema.performances.showId })
    .from(schema.performances)
    .where(and(
      eq(schema.performances.status, 'ON_SALE'),
      gt(schema.performances.startsAt, now),
    ))

  const shows = await db.query.shows.findMany({
    where: (s, { and: all, eq: is, inArray: within }) => all(
      is(s.status, 'PUBLISHED'),
      within(s.id, showsOnSale),
    ),
    with: {
      performances: {
        where: (p, { and: all, eq: is, gt: after }) => all(
          is(p.status, 'ON_SALE'),
          after(p.startsAt, now),
        ),
        orderBy: [asc(schema.performances.startsAt)],
        with: {
          venue: {
            columns: { id: true, name: true, capacity: true },
          },
        },
      },
    },
  })

  // Ticket counts scoped by subquery rather than a list of performance ids:
  // D1 allows at most 100 bound parameters, and a festival with more than 100
  // performances on sale at once would have exceeded that.
  const onSalePerformances = db
    .select({ id: schema.performances.id })
    .from(schema.performances)
    .where(and(
      eq(schema.performances.status, 'ON_SALE'),
      gt(schema.performances.startsAt, now),
    ))

  const ticketCounts = await db
    .select({
      performanceId: schema.tickets.performanceId,
      count: count(),
    })
    .from(schema.tickets)
    .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
    .where(and(
      inArray(schema.tickets.performanceId, onSalePerformances),
      // Only count tickets from active reservations (not cancelled/no-show)
      inArray(schema.reservations.status, ['PENDING', 'COLLECTED', 'DOOR']),
      isNull(schema.tickets.refundedAt),
    ))
    .groupBy(schema.tickets.performanceId)

  const ticketCountMap = new Map(ticketCounts.map(r => [r.performanceId, r.count]))
  const byId = new Map(shows.map(s => [s.id, s]))

  // Rebuilt in the order the grouping query established.
  return orderedShowIds
    .map(id => byId.get(id))
    .filter(show => show !== undefined)
    .map(show => ({
      ...show,
      performances: show.performances.map(perf => ({
        ...perf,
        ticketsSold: ticketCountMap.get(perf.id) ?? 0,
        capacity: perf.capacityOverride ?? perf.venue.capacity ?? null,
      })),
    }))
})

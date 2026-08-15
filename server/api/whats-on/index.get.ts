import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt, inArray, min } from 'drizzle-orm'

/**
 * GET /api/whats-on — published shows with upcoming on-sale performances.
 */
export default defineEventHandler(async (event) => {
  const now = new Date()

  // Set before any return, including the empty one — placed after, the header is
  // skipped exactly when nothing is on sale.
  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')

  // Which published shows have a future ON_SALE performance, and when each
  // opens. Ordering by earliest performance is what the list wants.
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
    columns: publicShowColumns,
    with: {
      performances: {
        where: (p, { and: all, eq: is, gt: after }) => all(
          is(p.status, 'ON_SALE'),
          after(p.startsAt, now),
        ),
        columns: publicPerformanceColumns,
        orderBy: [asc(schema.performances.startsAt)],
        with: {
          venue: {
            columns: { id: true, name: true, capacity: true },
          },
        },
      },
    },
  })

  // Scoped by subquery rather than a list of performance ids (ADR-0006).
  const onSalePerformances = db
    .select({ id: schema.performances.id })
    .from(schema.performances)
    .where(and(
      eq(schema.performances.status, 'ON_SALE'),
      gt(schema.performances.startsAt, now),
    ))

  // The shared rule, so the public sold-out badge and the capacity check that
  // accepts the booking always agree (ADR-0007).
  const ticketCountMap = await countOccupiedSeats(
    inArray(schema.tickets.performanceId, onSalePerformances),
  )

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

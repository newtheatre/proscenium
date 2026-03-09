import { db, schema } from '@nuxthub/db'
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'

/**
 * GET /api/whats-on — list published shows with upcoming on-sale performances.
 *
 * Public endpoint — no authentication required.
 *
 * Returns shows that are PUBLISHED and have at least one ON_SALE performance
 * in the future, along with ticket availability info.
 */
export default defineEventHandler(async () => {
  const now = new Date()

  // Fetch published shows with their ON_SALE future performances
  const publishedShows = await db.query.shows.findMany({
    where: (s, { eq }) => eq(s.status, 'PUBLISHED'),
    with: {
      performances: {
        where: (p, { and, eq, gt }) => and(
          eq(p.status, 'ON_SALE'),
          gt(p.startsAt, now),
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

  // Only return shows that have at least one future ON_SALE performance
  const showsWithPerformances = publishedShows.filter(s => s.performances.length > 0)

  // Sort shows by their earliest performance date (soonest first)
  showsWithPerformances.sort((a, b) => {
    const aEarliest = a.performances[0]?.startsAt
    const bEarliest = b.performances[0]?.startsAt
    if (!aEarliest || !bEarliest) return 0
    return new Date(aEarliest).getTime() - new Date(bEarliest).getTime()
  })

  if (showsWithPerformances.length === 0) return []

  // Get ticket counts per performance for availability indicator
  const perfIds = showsWithPerformances.flatMap(s => s.performances.map(p => p.id))

  const ticketCounts = perfIds.length > 0
    ? await db
        .select({
          performanceId: schema.tickets.performanceId,
          count: count(),
        })
        .from(schema.tickets)
        .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
        .where(
          and(
            inArray(schema.tickets.performanceId, perfIds),
            // Only count tickets from active reservations (not cancelled/no-show)
            inArray(schema.reservations.status, ['PENDING', 'COLLECTED', 'DOOR']),
            isNull(schema.tickets.refundedAt),
          ),
        )
        .groupBy(schema.tickets.performanceId)
        .all()
    : []

  const ticketCountMap = new Map(ticketCounts.map(r => [r.performanceId, r.count]))

  return showsWithPerformances.map(show => ({
    ...show,
    performances: show.performances.map(perf => ({
      ...perf,
      ticketsSold: ticketCountMap.get(perf.id) ?? 0,
      capacity: perf.capacityOverride ?? perf.venue.capacity ?? null,
    })),
  }))
})

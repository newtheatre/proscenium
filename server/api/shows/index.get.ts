import { db, schema } from '@nuxthub/db'
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'
import { listShows } from '~~/shared/utils/abilities'

/**
 * GET /api/shows — list all shows including drafts. Staff only; the public uses /api/whats-on.
 *
 * The per-show and per-performance counts are deliberately computed as whole-table
 * aggregates rather than by passing the loaded ids into `inArray(...)`.
 *
 * **D1 allows at most 100 bound parameters per query.** Since the legacy import
 * this endpoint sees 498 shows and 1,304 performances, so an id list built from
 * the result set binds 498 or 1,304 parameters and the query is rejected
 * outright. Grouping the override tables in full costs a few hundred rows and
 * binds nothing.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, listShows)

  const allShows = await db.query.shows.findMany({
    orderBy: [asc(schema.shows.title)],
    with: {
      performances: {
        orderBy: [asc(schema.performances.startsAt)],
        with: {
          venue: {
            columns: { id: true, name: true, capacity: true },
          },
        },
      },
    },
  })

  if (allShows.length === 0) return []

  const [showOverrideCounts, perfOverrideCounts, ticketCounts] = await Promise.all([
    db.select({ showId: schema.showTicketTypeOverrides.showId, c: count() })
      .from(schema.showTicketTypeOverrides)
      .groupBy(schema.showTicketTypeOverrides.showId)
      .all(),
    db.select({ performanceId: schema.performanceTicketTypeOverrides.performanceId, c: count() })
      .from(schema.performanceTicketTypeOverrides)
      .groupBy(schema.performanceTicketTypeOverrides.performanceId)
      .all(),
    // Non-refunded tickets on active reservations, per performance. The status
    // list is a fixed three-element literal, so it is safe to bind.
    db.select({
      performanceId: schema.tickets.performanceId,
      c: count(),
    })
      .from(schema.tickets)
      .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
      .where(
        and(
          inArray(schema.reservations.status, ['PENDING', 'COLLECTED', 'DOOR']),
          isNull(schema.tickets.refundedAt),
        ),
      )
      .groupBy(schema.tickets.performanceId)
      .all(),
  ])

  const showOverrideMap = new Map(
    showOverrideCounts.map((r: { showId: string, c: number }) => [r.showId, r.c]),
  )
  const perfOverrideMap = new Map(
    perfOverrideCounts.map((r: { performanceId: string, c: number }) => [r.performanceId, r.c]),
  )
  const ticketCountMap = new Map(
    ticketCounts.map((r: { performanceId: string, c: number }) => [r.performanceId, r.c]),
  )

  return allShows.map((show: { id: string, performances: Array<{ id: string }> }) => ({
    ...show,
    ticketTypeOverrideCount: showOverrideMap.get(show.id) ?? 0,
    performances: show.performances.map((perf: { id: string }) => ({
      ...perf,
      ticketTypeOverrideCount: perfOverrideMap.get(perf.id) ?? 0,
      ticketsSold: ticketCountMap.get(perf.id) ?? 0,
    })),
  }))
})

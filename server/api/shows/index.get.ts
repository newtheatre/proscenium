import { db, schema } from '@nuxthub/db'
import { asc, count, isNotNull } from 'drizzle-orm'
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
    // Only what the four callers actually render. This list is unpaginated by
    // design (the admin table is a tree over the whole archive), so the row
    // count is fixed but the row *width* is not: `longDescription` alone is a
    // paragraph per show across 498 of them, shipped and then made deeply
    // reactive by Vue on every navigation between /admin and /admin/shows,
    // none of which displays it.
    columns: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      description: true,
      posterUrl: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
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

  const [showOverrideCounts, perfOverrideCounts, ticketCountMap] = await Promise.all([
    db.select({ showId: schema.showTicketTypeOverrides.showId, c: count() })
      .from(schema.showTicketTypeOverrides)
      .groupBy(schema.showTicketTypeOverrides.showId)
      .all(),
    db.select({ performanceId: schema.performanceTicketTypeOverrides.performanceId, c: count() })
      .from(schema.performanceTicketTypeOverrides)
      .groupBy(schema.performanceTicketTypeOverrides.performanceId)
      .all(),
    // Seats occupied per performance, by the shared rule so this admin listing
    // agrees with what the booking path will actually allow. Whole-table scope
    // (`isNotNull` on a NOT NULL column) for the same 100-parameter reason as
    // the counts above — no id list is bound.
    countOccupiedSeats(isNotNull(schema.tickets.performanceId)),
  ])

  const showOverrideMap = new Map(
    showOverrideCounts.map((r: { showId: string, c: number }) => [r.showId, r.c]),
  )
  const perfOverrideMap = new Map(
    perfOverrideCounts.map((r: { performanceId: string, c: number }) => [r.performanceId, r.c]),
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

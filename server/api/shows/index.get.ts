import { db, schema } from '@nuxthub/db'
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'
import { listShows } from '~~/shared/utils/abilities'

/** GET /api/shows — list all shows including drafts. Staff only; the public uses /api/whats-on. */
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

  // Fetch override counts so the UI can show badges
  const showIds = allShows.map((s: { id: string }) => s.id)
  const perfIds = allShows.flatMap((s: { performances: Array<{ id: string }> }) =>
    s.performances.map((p: { id: string }) => p.id),
  )

  const [showOverrideCounts, perfOverrideCounts, ticketCounts] = await Promise.all([
    db.select({ showId: schema.showTicketTypeOverrides.showId, c: count() })
      .from(schema.showTicketTypeOverrides)
      .where(inArray(schema.showTicketTypeOverrides.showId, showIds))
      .groupBy(schema.showTicketTypeOverrides.showId)
      .all(),
    perfIds.length > 0
      ? db.select({ performanceId: schema.performanceTicketTypeOverrides.performanceId, c: count() })
          .from(schema.performanceTicketTypeOverrides)
          .where(inArray(schema.performanceTicketTypeOverrides.performanceId, perfIds))
          .groupBy(schema.performanceTicketTypeOverrides.performanceId)
          .all()
      : Promise.resolve([]),
    // Count non-refunded tickets from active reservations per performance
    perfIds.length > 0
      ? db.select({
          performanceId: schema.tickets.performanceId,
          c: count(),
        })
          .from(schema.tickets)
          .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
          .where(
            and(
              inArray(schema.tickets.performanceId, perfIds),
              inArray(schema.reservations.status, ['PENDING', 'COLLECTED', 'DOOR']),
              isNull(schema.tickets.refundedAt),
            ),
          )
          .groupBy(schema.tickets.performanceId)
          .all()
      : Promise.resolve([]),
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

import { shows, performances, showTicketTypeOverrides, performanceTicketTypeOverrides } from 'hub:db:schema'
import { asc, count, inArray } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const allShows = await db.query.shows.findMany({
    orderBy: [asc(shows.title)],
    with: {
      performances: {
        orderBy: [asc(performances.startsAt)],
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

  const [showOverrideCounts, perfOverrideCounts] = await Promise.all([
    db.select({ showId: showTicketTypeOverrides.showId, c: count() })
      .from(showTicketTypeOverrides)
      .where(inArray(showTicketTypeOverrides.showId, showIds))
      .groupBy(showTicketTypeOverrides.showId)
      .all(),
    perfIds.length > 0
      ? db.select({ performanceId: performanceTicketTypeOverrides.performanceId, c: count() })
          .from(performanceTicketTypeOverrides)
          .where(inArray(performanceTicketTypeOverrides.performanceId, perfIds))
          .groupBy(performanceTicketTypeOverrides.performanceId)
          .all()
      : Promise.resolve([]),
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
    })),
  }))
})

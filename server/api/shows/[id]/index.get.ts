import { db, schema } from '@nuxthub/db'
import { asc, count, eq, inArray } from 'drizzle-orm'
import { readShow } from '~~/shared/utils/abilities'

/**
 * GET /api/shows/:id — one show, in full. Staff only; the public uses /api/whats-on.
 *
 * Unlike `/api/shows`, this returns **every column** — including
 * `longDescription`, `programmeUrl`, `externalUrl`, `contentWarningNotes` and
 * `warningsConfirmedNone`, which the list projection deliberately omits. That is
 * the point of it: anything that *edits* a show has to read it from here, or it
 * will write nulls over the fields it never received. See docs/09-known-issues.md
 * "Editing a show wiped its write-up".
 *
 * All the counts scope through a subquery on this show's performances rather
 * than binding their ids — one bound parameter each, whatever the run length.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, readShow)

  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  const show = await db.query.shows.findFirst({
    where: (shows, { eq: matches }) => matches(shows.id, showId),
    with: {
      performances: {
        orderBy: [asc(schema.performances.startsAt)],
        with: {
          venue: {
            columns: { id: true, name: true, capacity: true },
          },
        },
      },
      contentWarnings: {
        with: { contentWarning: true },
      },
    },
  })

  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  const performancesOfShow = db
    .select({ id: schema.performances.id })
    .from(schema.performances)
    .where(eq(schema.performances.showId, showId))

  const [showOverrideRows, perfOverrideRows, ticketCountMap] = await Promise.all([
    db.select({ c: count() })
      .from(schema.showTicketTypeOverrides)
      .where(eq(schema.showTicketTypeOverrides.showId, showId)),
    db.select({ performanceId: schema.performanceTicketTypeOverrides.performanceId, c: count() })
      .from(schema.performanceTicketTypeOverrides)
      .where(inArray(schema.performanceTicketTypeOverrides.performanceId, performancesOfShow))
      .groupBy(schema.performanceTicketTypeOverrides.performanceId),
    countOccupiedSeats(inArray(schema.tickets.performanceId, performancesOfShow)),
  ])

  const perfOverrideMap = new Map(perfOverrideRows.map(r => [r.performanceId, r.c]))
  const performances = show.performances.map(performance => ({
    ...performance,
    ticketTypeOverrideCount: perfOverrideMap.get(performance.id) ?? 0,
    ticketsSold: ticketCountMap.get(performance.id) ?? 0,
  }))

  return {
    ...show,
    performances,
    ticketTypeOverrideCount: showOverrideRows[0]?.c ?? 0,
    performanceCount: performances.length,
    firstPerformanceAt: performances.at(0)?.startsAt ?? null,
    lastPerformanceAt: performances.at(-1)?.startsAt ?? null,
  }
})

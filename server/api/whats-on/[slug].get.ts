import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt, inArray } from 'drizzle-orm'

/**
 * GET /api/whats-on/:slug — get a published show by slug with performances and ticket types.
 *
 * Public endpoint — no authentication required.
 *
 * Returns the show with all ON_SALE future performances, venue details,
 * and the available ticket types with effective prices for each performance.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Show slug is required' })
  }

  const now = new Date()

  const show = await db.query.shows.findFirst({
    where: (s, { and, eq }) => and(eq(s.slug, slug), eq(s.status, 'PUBLISHED')),
    columns: publicShowColumns,
    with: {
      performances: {
        where: (p, { and, eq, gt }) => and(
          eq(p.status, 'ON_SALE'),
          gt(p.startsAt, now),
        ),
        columns: publicPerformanceColumns,
        orderBy: [asc(schema.performances.startsAt)],
        with: {
          // Allow-listed rather than `true`: the venue row is spread into a
          // public, edge-cached response.
          venue: { columns: { id: true, name: true, address: true, capacity: true } },
        },
      },
      // The import loaded 1,001 show-to-warning links across 424 warnings and
      // none of it reached the page where someone decides whether to attend.
      contentWarnings: {
        with: {
          contentWarning: { columns: { id: true, title: true, icon: true } },
        },
      },
      category: { columns: { id: true, name: true, slug: true } },
    },
  })

  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  // The performances this response covers, as a subquery rather than a bound id
  // list. D1 allows at most 100 bound parameters per statement, and a Fringe
  // show can have well over 100 performances on sale at once — binding the ids
  // (and the ticket-type ids alongside them) made this public page fail
  // outright for exactly the busiest shows. /api/whats-on already avoids this;
  // this handler did the opposite next door to it.
  const showPerformances = db
    .select({ id: schema.performances.id })
    .from(schema.performances)
    .where(and(
      eq(schema.performances.showId, show.id),
      eq(schema.performances.status, 'ON_SALE'),
      gt(schema.performances.startsAt, now),
    ))

  const [allTicketTypes, showOverrides, perfOverrides, ticketCountMap] = await Promise.all([
    // Archived types are legacy-only: valid for historic tickets, hidden from
    // anything that sells.
    db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.archived, false)),

    db.select().from(schema.showTicketTypeOverrides)
      .where(eq(schema.showTicketTypeOverrides.showId, show.id)),

    // Not filtered by ticket-type id: an override row for a type this response
    // does not carry is simply never looked up (`resolveEffective*` finds by id),
    // and dropping the filter is what keeps the statement inside D1's limit.
    db.select().from(schema.performanceTicketTypeOverrides)
      .where(inArray(schema.performanceTicketTypeOverrides.performanceId, showPerformances)),

    countOccupiedSeats(inArray(schema.tickets.performanceId, showPerformances)),
  ])

  // Build ticket types per performance
  const performancesWithTickets = show.performances.map((perf) => {
    const perfTicketOverrides = perfOverrides.filter(o => o.performanceId === perf.id)

    const ctx = { baseTypes: allTicketTypes, showOverrides, perfOverrides: perfTicketOverrides }
    const ticketTypes = allTicketTypes
      .map((type) => {
        const { effectivePrice, active } = resolveEffectiveTicketType(type.id, ctx)
        return {
          id: type.id,
          name: type.name,
          description: type.description,
          effectivePrice,
          active,
        }
      })
      .filter(t => t.active)
      .sort((a, b) => a.effectivePrice - b.effectivePrice)

    const ticketsSold = ticketCountMap.get(perf.id) ?? 0
    const capacity = perf.capacityOverride ?? perf.venue.capacity ?? null

    return {
      ...perf,
      ticketTypes,
      ticketsSold,
      capacity,
      isSoldOut: capacity !== null && ticketsSold >= capacity,
      // So the listing can say "booking closed" rather than letting a customer
      // pick a performance and only find out when the booking is rejected.
      isBookingClosed: !isBookingOpen(perf),
    }
  })

  // Same reasoning as the listing: fully public, slow-changing, and the only
  // fast-moving field is ticketsSold, which is advisory here — capacity is
  // enforced when the booking is written.
  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')

  return {
    ...show,
    performances: performancesWithTickets,
  }
})

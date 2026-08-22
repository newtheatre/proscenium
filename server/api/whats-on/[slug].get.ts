import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm'

/**
 * GET /api/whats-on/:slug — get a published show by slug with performances
 * and ticket types.
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
      // Allow-listed on both sides — the link row's ids mean nothing publicly and
      // would be edge-cached along with everything else.
      contentWarnings: {
        columns: publicContentWarningLinkColumns,
        with: {
          contentWarning: { columns: publicContentWarningColumns },
        },
      },
      category: { columns: { id: true, name: true, slug: true } },
    },
  })

  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  // A subquery, not a bound id list: a Fringe show can have well over 100
  // performances on sale at once (ADR-0006).
  const showPerformances = db
    .select({ id: schema.performances.id })
    .from(schema.performances)
    .where(and(
      eq(schema.performances.showId, show.id),
      eq(schema.performances.status, 'ON_SALE'),
      gt(schema.performances.startsAt, now),
    ))

  const [allTicketTypes, showOverrides, perfOverrides, ticketCountMap] = await Promise.all([
    // Plus: access types are never advertised publicly. Entitlement is
    // account-level, so /api/bookings/my-options offers them (docs/12 §2.6).
    db.select().from(schema.ticketTypes).where(and(sellableTicketTypes(), isNull(schema.ticketTypes.accessKind))),

    db.select().from(schema.showTicketTypeOverrides)
      .where(eq(schema.showTicketTypeOverrides.showId, show.id)),

    // Not filtered by ticket-type id: an override for a type this response does
    // not carry is simply never looked up.
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

  // Public and slow-changing. The only fast-moving field is ticketsSold, which
  // is advisory — capacity is enforced at write time.
  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')

  return {
    ...show,
    performances: performancesWithTickets,
  }
})

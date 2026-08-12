import { db, schema } from '@nuxthub/db'
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'

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
    with: {
      performances: {
        where: (p, { and, eq, gt }) => and(
          eq(p.status, 'ON_SALE'),
          gt(p.startsAt, now),
        ),
        orderBy: [asc(schema.performances.startsAt)],
        with: {
          venue: true,
        },
      },
    },
  })

  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  // Load all base ticket types
  const allTicketTypes = await db.select().from(schema.ticketTypes)
  const typeIds = allTicketTypes.map(t => t.id)

  // Load show-level overrides
  const showOverrides = typeIds.length > 0
    ? await db.select().from(schema.showTicketTypeOverrides).where(
        and(
          eq(schema.showTicketTypeOverrides.showId, show.id),
          inArray(schema.showTicketTypeOverrides.ticketTypeId, typeIds),
        ),
      )
    : []

  // Load performance-level overrides for all performances
  const perfIds = show.performances.map(p => p.id)
  const perfOverrides = perfIds.length > 0 && typeIds.length > 0
    ? await db.select().from(schema.performanceTicketTypeOverrides).where(
        and(
          inArray(schema.performanceTicketTypeOverrides.performanceId, perfIds),
          inArray(schema.performanceTicketTypeOverrides.ticketTypeId, typeIds),
        ),
      )
    : []

  // Get ticket counts per performance for availability
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
            inArray(schema.reservations.status, ['PENDING', 'COLLECTED', 'DOOR']),
            isNull(schema.tickets.refundedAt),
          ),
        )
        .groupBy(schema.tickets.performanceId)
        .all()
    : []

  const ticketCountMap = new Map(ticketCounts.map(r => [r.performanceId, r.count]))

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

  return {
    ...show,
    performances: performancesWithTickets,
  }
})

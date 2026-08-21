import { db, schema } from '@nuxthub/db'
import { and, count, desc, eq, gt, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { isAdminOrManager } from '~~/shared/utils/abilities'
import type { AbilityUser } from '~~/shared/utils/abilities'

const querySchema = z.object({
  /** Inclusive performance-date bounds, YYYY-MM-DD. Defaults to the current season. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/**
 * The theatre's season runs 1 August to 31 July, matching the university year
 * and the committee handover.
 */
function currentSeason(now: Date): { from: string, to: string } {
  const startYear = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return { from: `${startYear}-08-01`, to: `${startYear + 1}-07-31` }
}

/**
 * GET /api/admin/stats — aggregate dashboard statistics.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, defineAbility((user: AbilityUser) => isAdminOrManager(user)))

  const now = new Date()
  const { from, to } = await getValidatedQuery(event, querySchema.parse)
  const season = currentSeason(now)
  // Whole days in Europe/London, not UTC midnights — the Worker runs in UTC and
  // an unpinned bound moves the season boundary by an hour through BST.
  const windowFrom = validityStart(from ?? season.from)
  const windowTo = validityEnd(to ?? season.to)

  // Only count revenue for tickets that have actually been paid at the box office.
  // PENDING reservations are pre-bookings that have not yet exchanged money.
  const revenueStatuses = ['COLLECTED', 'DOOR'] as const

  const inWindow = and(
    inArray(schema.reservations.status, revenueStatuses),
    isNull(schema.tickets.refundedAt),
    gte(schema.performances.startsAt, windowFrom),
    lte(schema.performances.startsAt, windowTo),
  )

  // Money, excluding pass admissions (the pass sale is where the money was).
  const revenueExpr = sql<number>`coalesce(sum(case when ${schema.ticketTypes.kind} = 'PASS_ADMISSION' then 0 else ${schema.tickets.pricePaid} end), 0)`
  // Bums on seats, excluding the sale of a pass (which admits nobody by itself).
  const admissionsExpr = sql<number>`coalesce(sum(case when ${schema.ticketTypes.kind} = 'PASS_SALE' then 0 else 1 end), 0)`

  const [
    activeShowsResult,
    upcomingPerfsResult,
    reservationsByStatusResult,
    revenueAndTicketsResult,
    revenueByShowResult,
    recentReservations,
  ] = await Promise.all([
    // Published shows *in the window* — a show counts if it has a performance
    // inside it. The subquery keeps the parameter cost fixed (ADR-0006).
    db.select({ count: count() })
      .from(schema.shows)
      .where(and(
        eq(schema.shows.status, 'PUBLISHED'),
        inArray(
          schema.shows.id,
          db.select({ id: schema.performances.showId })
            .from(schema.performances)
            .where(and(
              gte(schema.performances.startsAt, windowFrom),
              lte(schema.performances.startsAt, windowTo),
            )),
        ),
      )),

    // Upcoming on-sale performances
    db.select({ count: count() })
      .from(schema.performances)
      .where(and(
        eq(schema.performances.status, 'ON_SALE'),
        gt(schema.performances.startsAt, now),
      )),

    // Reservation counts by status, for performances in the window. Unbounded,
    // this reports every reservation since 2016 under a season heading.
    db.select({ status: schema.reservations.status, count: count() })
      .from(schema.reservations)
      .innerJoin(schema.performances, eq(schema.reservations.performanceId, schema.performances.id))
      .where(and(
        gte(schema.performances.startsAt, windowFrom),
        lte(schema.performances.startsAt, windowTo),
      ))
      .groupBy(schema.reservations.status),

    // Revenue (pence), admissions, and how much of it we can vouch for
    db.select({
      totalRevenue: revenueExpr,
      totalTickets: admissionsExpr,
      unknownPricedTickets: sql<number>`coalesce(sum(case when ${schema.tickets.priceConfidence} = 'UNKNOWN' then 1 else 0 end), 0)`,
      derivedPricedTickets: sql<number>`coalesce(sum(case when ${schema.tickets.priceConfidence} = 'DERIVED' then 1 else 0 end), 0)`,
    })
      .from(schema.tickets)
      .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
      .innerJoin(schema.performances, eq(schema.tickets.performanceId, schema.performances.id))
      .innerJoin(schema.ticketTypes, eq(schema.tickets.ticketTypeId, schema.ticketTypes.id))
      .where(inWindow),

    // Revenue breakdown per show
    db.select({
      showId: schema.shows.id,
      showTitle: schema.shows.title,
      showStatus: schema.shows.status,
      totalRevenue: revenueExpr,
      totalTickets: admissionsExpr,
    })
      .from(schema.tickets)
      .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
      .innerJoin(schema.performances, eq(schema.tickets.performanceId, schema.performances.id))
      .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
      .innerJoin(schema.ticketTypes, eq(schema.tickets.ticketTypeId, schema.ticketTypes.id))
      .where(inWindow)
      .groupBy(schema.shows.id, schema.shows.title, schema.shows.status)
      .orderBy(desc(revenueExpr)),

    // Ten most recent reservations with related data
    db.query.reservations.findMany({
      limit: 10,
      orderBy: (r, { desc }) => [desc(r.createdAt)],
      with: {
        user: { columns: { id: true, name: true, email: true } },
        performance: {
          with: {
            show: { columns: { id: true, title: true } },
            venue: { columns: { id: true, name: true } },
          },
        },
      },
    }),
  ])

  const totals = revenueAndTicketsResult[0]

  // Not defineCachedEventHandler, which skips the handler on a hit — including
  // the authorize() above, so the finances could be served unauthenticated.
  setHeader(event, 'Cache-Control', 'private, max-age=30')

  return {
    window: {
      from: (from ?? season.from),
      to: (to ?? season.to),
      isCurrentSeason: !from && !to,
    },
    activeShows: activeShowsResult[0]?.count ?? 0,
    upcomingPerformances: upcomingPerfsResult[0]?.count ?? 0,
    totalRevenuePence: Number(totals?.totalRevenue ?? 0),
    totalTicketsSold: Number(totals?.totalTickets ?? 0),
    unknownPricedTickets: Number(totals?.unknownPricedTickets ?? 0),
    derivedPricedTickets: Number(totals?.derivedPricedTickets ?? 0),
    reservationsByStatus: reservationsByStatusResult,
    revenueByShow: revenueByShowResult.map(r => ({
      showId: r.showId,
      showTitle: r.showTitle,
      showStatus: r.showStatus,
      totalRevenuePence: Number(r.totalRevenue ?? 0),
      totalTickets: Number(r.totalTickets),
    })),
    recentReservations,
  }
})

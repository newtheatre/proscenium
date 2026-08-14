import { db, schema } from '@nuxthub/db'
import { and, count, desc, eq, gt, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod/v4'
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
 * ADMIN and MANAGER only.
 *
 * Bounded to a season by default. These aggregates used to have no date bound at
 * all, so after the import the dashboard presented £105,245.50 of takings going
 * back to 2016, and 23,889 legacy tickets, as though they were the current
 * year's — with no indication that most of it was a decade old.
 *
 * Two further corrections to what gets counted:
 *
 * - PASS_SALE tickets are money but not admissions, and PASS_ADMISSION rows are
 *   admissions but not money. Counting both in both places double-counted the
 *   135 pass sales against the 1,186 entries they paid for, which is exactly
 *   what ticket.ts warns about. Revenue therefore excludes PASS_ADMISSION, and
 *   the admissions count excludes PASS_SALE.
 *
 * - 20,234 imported tickets have priceConfidence UNKNOWN and pricePaid 0: the
 *   price was never recorded. They are real admissions and still counted as
 *   such, but they contribute nothing to revenue, so revenue-per-ticket read
 *   about half true with no hint why. The counts are returned alongside so the
 *   dashboard can say so.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, defineAbility((user: AbilityUser) => isAdminOrManager(user)))

  const now = new Date()
  const { from, to } = await getValidatedQuery(event, querySchema.parse)
  const season = currentSeason(now)
  const windowFrom = new Date(`${from ?? season.from}T00:00:00Z`)
  const windowTo = new Date(`${to ?? season.to}T23:59:59Z`)

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
    // Published shows *in the window*. This used to count every published show
    // ever, so a dashboard headed "2026/27 season" reported 488 — the whole
    // imported archive — next to a season's takings. A show counts if it has a
    // performance inside the window; the subquery keeps the bound-parameter cost
    // fixed rather than growing with the archive.
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

    // Reservation counts by status, for performances in the window. Unbounded
    // like the show count was, this reported every reservation since 2016 under
    // a season heading.
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

  // Private, browser-only, and short: a dashboard does not need to be
  // second-accurate, and this stops a reload or a tab switch re-running the
  // aggregates.
  //
  // Deliberately not defineCachedEventHandler. That caches the handler's result
  // and skips the handler on a hit — including the authorize() call above — so
  // an unauthenticated request could be served a cached copy of the theatre's
  // finances. Keying the cache on the session cookie would fix that and also
  // make it per-user, which is what this header already does without the
  // footgun. The row counts that motivated caching here were mostly the missing
  // date bound, and that is fixed: the aggregates now read about 1,100 ticket
  // rows for a season rather than 25,006 for all time.
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

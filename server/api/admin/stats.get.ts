import { db, schema } from '@nuxthub/db'
import { and, count, desc, eq, gt, inArray, isNull, sum } from 'drizzle-orm'
import { isAdminOrManager } from '~~/shared/utils/abilities'
import type { AbilityUser } from '~~/shared/utils/abilities'

/**
 * GET /api/admin/stats — aggregate dashboard statistics.
 * ADMIN and MANAGER only.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, defineAbility((user: AbilityUser) => isAdminOrManager(user)))

  const now = new Date()
  const activeStatuses = ['PENDING', 'COLLECTED', 'DOOR'] as const

  const [
    activeShowsResult,
    upcomingPerfsResult,
    reservationsByStatusResult,
    revenueAndTicketsResult,
    revenueByShowResult,
    recentReservations,
  ] = await Promise.all([
    // Published shows count
    db.select({ count: count() })
      .from(schema.shows)
      .where(eq(schema.shows.status, 'PUBLISHED')),

    // Upcoming on-sale performances
    db.select({ count: count() })
      .from(schema.performances)
      .where(and(
        eq(schema.performances.status, 'ON_SALE'),
        gt(schema.performances.startsAt, now),
      )),

    // Reservation counts grouped by status
    db.select({ status: schema.reservations.status, count: count() })
      .from(schema.reservations)
      .groupBy(schema.reservations.status),

    // Total revenue (pence) and total ticket count from active reservations
    db.select({
      totalRevenue: sum(schema.tickets.pricePaid),
      totalTickets: count(),
    })
      .from(schema.tickets)
      .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
      .where(and(
        inArray(schema.reservations.status, activeStatuses),
        isNull(schema.tickets.refundedAt),
      )),

    // Revenue breakdown per show (active reservations, non-refunded)
    db.select({
      showId: schema.shows.id,
      showTitle: schema.shows.title,
      showStatus: schema.shows.status,
      totalRevenue: sum(schema.tickets.pricePaid),
      totalTickets: count(),
    })
      .from(schema.tickets)
      .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
      .innerJoin(schema.performances, eq(schema.tickets.performanceId, schema.performances.id))
      .innerJoin(schema.shows, eq(schema.performances.showId, schema.shows.id))
      .where(and(
        inArray(schema.reservations.status, activeStatuses),
        isNull(schema.tickets.refundedAt),
      ))
      .groupBy(schema.shows.id, schema.shows.title, schema.shows.status)
      .orderBy(desc(sum(schema.tickets.pricePaid))),

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

  return {
    activeShows: activeShowsResult[0]?.count ?? 0,
    upcomingPerformances: upcomingPerfsResult[0]?.count ?? 0,
    totalRevenuePence: Number(revenueAndTicketsResult[0]?.totalRevenue ?? 0),
    totalTicketsSold: revenueAndTicketsResult[0]?.totalTickets ?? 0,
    reservationsByStatus: reservationsByStatusResult,
    revenueByShow: revenueByShowResult.map(r => ({
      showId: r.showId,
      showTitle: r.showTitle,
      showStatus: r.showStatus,
      totalRevenuePence: Number(r.totalRevenue ?? 0),
      totalTickets: r.totalTickets,
    })),
    recentReservations,
  }
})

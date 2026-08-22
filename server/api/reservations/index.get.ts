import { db, schema } from '@nuxthub/db'
import { and, count, eq, inArray, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { listReservations } from '~~/shared/utils/abilities'

const querySchema = paginationSchema.extend({
  performanceId: z.string().optional(),
  showId: z.string().optional(),
  userId: z.string().optional(),
  status: z.enum(['PENDING', 'COLLECTED', 'DOOR', 'CANCELLED', 'NO_SHOW']).optional(),
  withCounts: z.enum(['true', 'false']).optional(),
})

/**
 * GET /api/reservations: list reservations.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, listReservations)

  const { performanceId, showId, userId, status, withCounts, page, limit, q }
    = await getValidatedQuery(event, querySchema.parse)

  // Filtering by show uses a subquery, never an id list built from a result set
  // (ADR-0006).
  const showPerformances = db
    .select({ id: schema.performances.id })
    .from(schema.performances)
    .where(eq(schema.performances.showId, showId ?? ''))

  const filters = []
  if (performanceId) filters.push(eq(schema.reservations.performanceId, performanceId))
  if (showId) filters.push(inArray(schema.reservations.performanceId, showPerformances))
  if (userId) filters.push(eq(schema.reservations.userId, userId))
  if (status) filters.push(eq(schema.reservations.status, status))

  if (q) {
    const matchingUsers = db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(or(
        likeInsensitive(schema.users.name, q),
        likeInsensitive(schema.users.email, q),
      ))
    filters.push(or(
      eq(schema.reservations.bookingRef, q.toUpperCase()),
      inArray(schema.reservations.userId, matchingUsers),
    ))
  }

  const where = filters.length ? and(...filters) : undefined

  const [totalRow] = await db
    .select({ n: count() })
    .from(schema.reservations)
    .where(where)

  const total = totalRow?.n ?? 0
  if (total === 0) return paginated([], 0, { page, limit })

  const rows = await db.query.reservations.findMany({
    where: () => where,
    with: reservationSummaryWith,
    orderBy: (r, { desc }) => [desc(r.createdAt)],
    limit,
    offset: offsetFor({ page, limit }),
  })

  if (withCounts !== 'true') return paginated(rows, total, { page, limit })

  // Ticket counts for this page only: at most `limit` (≤100) ids, so it stays
  // inside D1's bound-parameter budget.
  const pageIds = rows.map(r => r.id)
  const ticketCounts = pageIds.length
    ? await db
        .select({ reservationId: schema.tickets.reservationId, c: count() })
        .from(schema.tickets)
        .where(and(inArray(schema.tickets.reservationId, pageIds), isNull(schema.tickets.refundedAt)))
        .groupBy(schema.tickets.reservationId)
    : []

  const ticketCountMap = new Map(ticketCounts.map(r => [r.reservationId, Number(r.c)]))

  return paginated(
    rows.map(r => ({ ...r, ticketCount: ticketCountMap.get(r.id) ?? 0 })),
    total,
    { page, limit },
  )
})

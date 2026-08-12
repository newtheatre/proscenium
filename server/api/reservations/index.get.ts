import { db, schema } from '@nuxthub/db'
import { and, count, eq, inArray, isNull, like, or, sql } from 'drizzle-orm'
import { z } from 'zod/v4'
import { listReservations } from '~~/shared/utils/abilities'

const querySchema = paginationSchema.extend({
  performanceId: z.string().optional(),
  showId: z.string().optional(),
  userId: z.string().optional(),
  status: z.enum(['PENDING', 'COLLECTED', 'DOOR', 'CANCELLED', 'NO_SHOW']).optional(),
  withCounts: z.enum(['true', 'false']).optional(),
})

/**
 * GET /api/reservations — list reservations. Staff only.
 *
 * Paginated in SQL, returning a `{ rows, total, page, limit }` envelope. There
 * are 30,000+ reservations, so returning the whole table and filtering in the
 * browser is not viable — it was ~18 MB of JSON per page load, assembled inside
 * a Worker.
 *
 * Search covers booking reference, holder name and holder email, in SQL for the
 * same reason.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, listReservations)

  const { performanceId, showId, userId, status, withCounts, page, limit, q }
    = await getValidatedQuery(event, querySchema.parse)

  // Filtering by show uses a subquery rather than an id list: D1 allows at most
  // 100 bound parameters, so a list built from a result set is a latent hard
  // failure as the data grows.
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
    const term = likeTerm(q)
    const matchingUsers = db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(or(
        like(sql`lower(${schema.users.name})`, term),
        like(sql`lower(${schema.users.email})`, term),
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

  // Ticket counts for this page only — at most `limit` (≤100) ids, so it stays
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

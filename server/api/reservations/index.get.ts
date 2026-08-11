import { db, schema } from '@nuxthub/db'
import { and, count, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod/v4'
import { listReservations } from '~~/shared/utils/abilities'

const querySchema = z.object({
  performanceId: z.string().optional(),
  showId: z.string().optional(),
  userId: z.string().optional(),
  status: z.enum(['PENDING', 'COLLECTED', 'DOOR', 'CANCELLED', 'NO_SHOW']).optional(),
  withCounts: z.enum(['true', 'false']).optional(),
})

/** GET /api/reservations — list reservations with optional filters. Staff only. */
export default defineEventHandler(async (event) => {
  await authorize(event, listReservations)

  const { performanceId, showId, userId, status, withCounts } = await getValidatedQuery(event, querySchema.parse)

  // Filtering by show is expressed as a subquery rather than by loading the
  // show's performance ids and binding them. D1 allows at most 100 bound
  // parameters per query, so an id list built from a result set is a latent
  // hard failure as soon as the data grows.
  const showPerformances = db
    .select({ id: schema.performances.id })
    .from(schema.performances)
    .where(eq(schema.performances.showId, showId ?? ''))

  const filters = []
  if (performanceId) filters.push(eq(schema.reservations.performanceId, performanceId))
  if (showId) filters.push(inArray(schema.reservations.performanceId, showPerformances))
  if (userId) filters.push(eq(schema.reservations.userId, userId))
  if (status) filters.push(eq(schema.reservations.status, status))
  const where = filters.length ? and(...filters) : undefined

  const allReservations = await db.query.reservations.findMany({
    where: () => where,
    with: reservationSummaryWith,
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  })

  if (allReservations.length === 0) return []
  if (withCounts !== 'true') return allReservations

  // One grouped aggregate over the same filtered set — no chunking, and nothing
  // bound from the rows we just loaded. (The previous version chunked 800 ids
  // per query, eight times over D1's limit.)
  const ticketCounts = await db
    .select({ reservationId: schema.tickets.reservationId, c: count() })
    .from(schema.tickets)
    .innerJoin(schema.reservations, eq(schema.tickets.reservationId, schema.reservations.id))
    .where(where ? and(where, isNull(schema.tickets.refundedAt)) : isNull(schema.tickets.refundedAt))
    .groupBy(schema.tickets.reservationId)

  const ticketCountMap = new Map(ticketCounts.map(r => [r.reservationId, Number(r.c)]))

  return allReservations.map(r => ({
    ...r,
    ticketCount: ticketCountMap.get(r.id) ?? 0,
  }))
})

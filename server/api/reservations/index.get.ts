import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { listReservations } from '~~/shared/utils/abilities'

const querySchema = z.object({
  performanceId: z.string().optional(),
  showId: z.string().optional(),
  userId: z.string().optional(),
  status: z.enum(['PENDING', 'COLLECTED', 'DOOR', 'CANCELLED', 'NO_SHOW']).optional(),
})

/** GET /api/reservations — list reservations with optional filters. Staff only. */
export default defineEventHandler(async (event) => {
  await authorize(event, listReservations)

  const { performanceId, showId, userId, status } = await getValidatedQuery(event, querySchema.parse)

  // Resolve performance IDs when filtering by show
  let resolvedPerfIds: string[] | undefined
  if (showId) {
    const showPerfs = await db
      .select({ id: schema.performances.id })
      .from(schema.performances)
      .where(eq(schema.performances.showId, showId))
    const ids = showPerfs.map(p => p.id)
    if (ids.length === 0) return []
    resolvedPerfIds = ids
  }

  const allReservations = await db.query.reservations.findMany({
    where: (r, { eq, and, inArray }) => {
      const conditions = []
      if (performanceId) conditions.push(eq(r.performanceId, performanceId))
      if (resolvedPerfIds) conditions.push(inArray(r.performanceId, resolvedPerfIds))
      if (userId) conditions.push(eq(r.userId, userId))
      if (status) conditions.push(eq(r.status, status))
      return conditions.length ? and(...conditions) : undefined
    },
    with: reservationSummaryWith,
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  })

  return allReservations
})

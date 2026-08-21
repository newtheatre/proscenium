import { db, schema } from '@nuxthub/db'
import { and, count, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { listReservations } from '~~/shared/utils/abilities'

const querySchema = z.object({
  performanceId: z.string().optional(),
  showId: z.string().optional(),
})

/**
 * GET /api/admin/reservation-counts — reservation totals by status.
 */
export default defineEventHandler(async (event) => {
  await authorize(event, listReservations)

  const { performanceId, showId } = await getValidatedQuery(event, querySchema.parse)

  const showPerformances = db
    .select({ id: schema.performances.id })
    .from(schema.performances)
    .where(eq(schema.performances.showId, showId ?? ''))

  const filters = []
  if (performanceId) filters.push(eq(schema.reservations.performanceId, performanceId))
  if (showId) filters.push(inArray(schema.reservations.performanceId, showPerformances))
  const where = filters.length ? and(...filters) : undefined

  const rows = await db
    .select({ status: schema.reservations.status, n: count() })
    .from(schema.reservations)
    .where(where)
    .groupBy(schema.reservations.status)

  const byStatus: Record<string, number> = {
    PENDING: 0,
    COLLECTED: 0,
    DOOR: 0,
    CANCELLED: 0,
    NO_SHOW: 0,
  }
  let total = 0
  for (const row of rows) {
    byStatus[row.status] = Number(row.n)
    total += Number(row.n)
  }

  return { byStatus, total }
})

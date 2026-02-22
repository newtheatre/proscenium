import { eq } from 'drizzle-orm'
import { performances } from 'hub:db:schema'
import { listReservations } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  await authorize(event, listReservations)

  const query = getQuery(event)
  const performanceId = query.performanceId as string | undefined
  const showId = query.showId as string | undefined
  const userId = query.userId as string | undefined
  const status = query.status as 'PENDING' | 'COLLECTED' | 'DOOR' | 'CANCELLED' | 'NO_SHOW' | undefined

  // Resolve performance IDs when filtering by show
  let performanceIds: string[] | undefined
  if (showId) {
    const showPerfs = await db
      .select({ id: performances.id })
      .from(performances)
      .where(eq(performances.showId, showId))
    performanceIds = showPerfs.map((p: { id: string }) => p.id)
    if (performanceIds.length === 0) {
      return []
    }
  }

  const resolvedPerfIds = performanceIds

  const allReservations = await db.query.reservations.findMany({
    where: (r: any, { eq, and, inArray }: any) => {
      const conditions = []
      if (performanceId) conditions.push(eq(r.performanceId, performanceId))
      if (resolvedPerfIds) conditions.push(inArray(r.performanceId, resolvedPerfIds))
      if (userId) conditions.push(eq(r.userId, userId))
      if (status) conditions.push(eq(r.status, status))
      return conditions.length ? and(...conditions) : undefined
    },
    with: {
      user: {
        columns: { id: true, name: true, email: true, password: false, verified: true },
      },
      performance: {
        with: {
          show: { columns: { id: true, title: true, slug: true } },
          venue: { columns: { id: true, name: true } },
        },
      },
    },
    orderBy: (r: any, { desc }: any) => [desc(r.createdAt)],
  })

  return allReservations
})

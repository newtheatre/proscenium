import { performances } from 'hub:db:schema'
import { eq, and } from 'drizzle-orm'
import { deletePerformance } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')
  const performanceId = getRouterParam(event, 'performanceId')

  if (!showId || !performanceId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID and Performance ID are required' })
  }

  await authorize(event, deletePerformance)

  const existing = await db.select().from(performances)
    .where(and(eq(performances.id, performanceId), eq(performances.showId, showId)))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Performance not found' })
  }

  try {
    await db.delete(performances).where(eq(performances.id, performanceId))
  }
  catch {
    throw createError({
      statusCode: 409,
      statusMessage: 'Cannot delete this performance because it has tickets associated with it',
    })
  }

  return { success: true, message: 'Performance deleted successfully' }
})

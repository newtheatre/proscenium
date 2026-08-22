import { db, schema } from '@nuxthub/db'
import { eq, and } from 'drizzle-orm'
import { deletePerformance } from '~~/shared/utils/abilities'

/** DELETE /api/shows/:id/performances/:performanceId. Delete a performance. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')
  const performanceId = getRouterParam(event, 'performanceId')

  if (!showId || !performanceId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID and Performance ID are required' })
  }

  await authorize(event, deletePerformance)

  const existing = await db.select().from(schema.performances)
    .where(and(eq(schema.performances.id, performanceId), eq(schema.performances.showId, showId)))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Performance not found' })
  }

  try {
    await db.delete(schema.performances).where(eq(schema.performances.id, performanceId))
  }
  catch {
    throw createError({
      statusCode: 409,
      statusMessage: 'Cannot delete this performance because it has tickets associated with it',
    })
  }

  return { message: 'Performance deleted successfully' }
})

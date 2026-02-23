import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { deleteShow } from '~~/shared/utils/abilities'

/** DELETE /api/shows/:id — delete a show. Admin only. */
export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  await authorize(event, deleteShow)

  const existing = await db.select().from(schema.shows).where(eq(schema.shows.id, showId)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  // Performances cascade-delete with the show (onDelete: 'cascade')
  await db.delete(schema.shows).where(eq(schema.shows.id, showId))

  return { message: 'Show deleted successfully' }
})

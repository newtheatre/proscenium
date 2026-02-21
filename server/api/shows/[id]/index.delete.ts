import { shows } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { deleteShow } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  await authorize(event, deleteShow)

  const existing = await db.select().from(shows).where(eq(shows.id, showId)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  // Performances cascade-delete with the show (onDelete: 'cascade')
  await db.delete(shows).where(eq(shows.id, showId))

  return { success: true, message: 'Show deleted successfully' }
})

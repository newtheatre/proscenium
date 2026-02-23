import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { blob } from 'hub:blob'
import { updateShow } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  await authorize(event, updateShow)

  const show = await db.select().from(schema.shows).where(eq(schema.shows.id, showId)).get()
  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  if (!show.posterUrl) {
    throw createError({ statusCode: 404, statusMessage: 'This show has no poster' })
  }

  await blob.delete(show.posterUrl)

  const [updated] = await db.update(schema.shows)
    .set({ posterUrl: null })
    .where(eq(schema.shows.id, showId))
    .returning()

  return updated
})

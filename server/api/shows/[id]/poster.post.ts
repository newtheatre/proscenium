import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { updateShow } from '~~/shared/utils/abilities'

/** POST /api/shows/:id/poster — upload a show poster image. Admin/Manager only. */
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

  const { pathname } = await validateAndUploadImage(event, {
    fieldName: 'poster',
    pathPrefix: `shows/${showId}`,
    existingPath: show.posterUrl,
  })

  const [updated] = await db.update(schema.shows)
    .set({ posterUrl: pathname })
    .where(eq(schema.shows.id, showId))
    .returning()

  return updated
})

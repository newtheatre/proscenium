import { db, schema } from '@nuxthub/db'
import { asc } from 'drizzle-orm'
import { readShow } from '~~/shared/utils/abilities'

/** GET /api/shows/:id — get a show by ID with performances. Staff only; the public uses /api/whats-on. */
export default defineEventHandler(async (event) => {
  await authorize(event, readShow)

  const showId = getRouterParam(event, 'id')

  if (!showId) {
    throw createError({ statusCode: 400, statusMessage: 'Show ID is required' })
  }

  const show = await db.query.shows.findFirst({
    where: (shows, { eq }) => eq(shows.id, showId),
    with: {
      performances: {
        orderBy: [asc(schema.performances.startsAt)],
        with: {
          venue: {
            columns: { id: true, name: true, capacity: true },
          },
        },
      },
    },
  })

  if (!show) {
    throw createError({ statusCode: 404, statusMessage: 'Show not found' })
  }

  return show
})

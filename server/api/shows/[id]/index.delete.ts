import { db, schema } from '@nuxthub/db'
import { count, eq, inArray } from 'drizzle-orm'
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

  // Performances cascade, but tickets and reservations reference them with
  // `restrict`, so a show that ever sold anything cannot be removed.
  const [bookings] = await db
    .select({ n: count() })
    .from(schema.reservations)
    .where(inArray(
      schema.reservations.performanceId,
      db.select({ id: schema.performances.id })
        .from(schema.performances)
        .where(eq(schema.performances.showId, showId)),
    ))

  if ((bookings?.n ?? 0) > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `This show cannot be deleted because it has ${bookings!.n} booking${bookings!.n === 1 ? '' : 's'} against its performances. Set it back to draft to hide it from the public listings — the sales history has to be kept.`,
    })
  }

  await db.delete(schema.shows).where(eq(schema.shows.id, showId))

  return { message: 'Show deleted successfully' }
})

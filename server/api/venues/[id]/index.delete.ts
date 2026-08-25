import { db, schema } from '@nuxthub/db'
import { count, eq } from 'drizzle-orm'
import { blob } from 'hub:blob'
import { deleteVenue } from '~~/shared/utils/abilities'

/** DELETE /api/venues/:id. Delete a venue. Admin only. */
export default defineEventHandler(async (event) => {
  const venueId = getRouterParam(event, 'id')

  if (!venueId) {
    throw createError({ statusCode: 400, statusMessage: 'Venue ID is required' })
  }

  // Check if user has permission to delete venues
  await authorize(event, deleteVenue)

  // Get the venue
  const venue = await db.select().from(schema.venues).where(eq(schema.venues.id, venueId)).get()

  if (!venue) {
    throw createError({ statusCode: 404, statusMessage: 'Venue not found' })
  }

  // `performances.venueId` is `restrict`, so the row delete below would raise a
  // bare 500 after the image had already gone.
  const [scheduled] = await db
    .select({ n: count() })
    .from(schema.performances)
    .where(eq(schema.performances.venueId, venueId))

  if ((scheduled?.n ?? 0) > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `This venue cannot be deleted because it has ${scheduled!.n} performance${scheduled!.n === 1 ? '' : 's'} against it. Move them to another venue first, the performance history has to be kept.`,
    })
  }

  // Related records cascade; the venue's own image is not one of them.
  await db.delete(schema.venues).where(eq(schema.venues.id, venueId))

  // After the row that addressed it is gone, never before (server/utils/images.ts).
  if (venue.imageUrl) {
    try {
      await blob.delete(venue.imageUrl)
    }
    catch (error) {
      console.error('Failed to delete venue image from blob storage:', error)
    }
  }

  return { message: 'Venue deleted successfully' }
})

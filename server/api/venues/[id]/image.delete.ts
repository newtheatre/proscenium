import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { blob } from 'hub:blob'
import { updateVenue } from '~~/shared/utils/abilities'

/** DELETE /api/venues/:id/image: delete a venue image. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  const venueId = getRouterParam(event, 'id')

  if (!venueId) {
    throw createError({ statusCode: 400, statusMessage: 'Venue ID is required' })
  }

  // Check if user has permission to update venues
  await authorize(event, updateVenue)

  // Get the venue
  const venue = await db.select().from(schema.venues).where(eq(schema.venues.id, venueId)).get()

  if (!venue) {
    throw createError({ statusCode: 404, statusMessage: 'Venue not found' })
  }

  if (!venue.imageUrl) {
    throw createError({ statusCode: 404, statusMessage: 'Venue has no image to delete' })
  }

  // Delete image from blob storage
  try {
    await blob.delete(venue.imageUrl)
  }
  catch (error) {
    console.error('Failed to delete venue image from blob storage:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete image from storage' })
  }

  // Update venue to remove image URL
  await db.update(schema.venues)
    .set({ imageUrl: null })
    .where(eq(schema.venues.id, venueId))

  return { message: 'Image deleted successfully' }
})

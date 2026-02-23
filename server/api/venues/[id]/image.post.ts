import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { updateVenue } from '~~/shared/utils/abilities'

/** POST /api/venues/:id/image — upload a venue image. Admin/Manager only. */
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

  const { pathname } = await validateAndUploadImage(event, {
    fieldName: 'image',
    pathPrefix: `venues/${venueId}`,
    existingPath: venue.imageUrl,
  })

  // Update venue with new image URL
  await db.update(schema.venues)
    .set({ imageUrl: pathname })
    .where(eq(schema.venues.id, venueId))

  return { imageUrl: pathname, message: 'Image uploaded successfully' }
})

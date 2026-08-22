import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { deleteVenueFeature } from '~~/shared/utils/abilities'

/** DELETE /api/venue-features/:id. Delete a venue feature. Admin only. */
export default defineEventHandler(async (event) => {
  const featureId = getRouterParam(event, 'id')

  if (!featureId) {
    throw createError({ statusCode: 400, statusMessage: 'Feature ID is required' })
  }

  // Check if user has permission to delete venue features
  await authorize(event, deleteVenueFeature)

  // Get the feature
  const feature = await db.select().from(schema.venueFeatures).where(eq(schema.venueFeatures.id, featureId)).get()

  if (!feature) {
    throw createError({ statusCode: 404, statusMessage: 'Venue feature not found' })
  }

  // Delete the feature (cascade will delete related records)
  await db.delete(schema.venueFeatures).where(eq(schema.venueFeatures.id, featureId))

  return { message: 'Venue feature deleted successfully' }
})

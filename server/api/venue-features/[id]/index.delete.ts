import { venueFeatures } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { deleteVenueFeature } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  const featureId = getRouterParam(event, 'id')

  if (!featureId) {
    throw createError({ statusCode: 400, statusMessage: 'Feature ID is required' })
  }

  // Check if user has permission to delete venue features
  await authorize(event, deleteVenueFeature)

  // Get the feature
  const feature = await db.select().from(venueFeatures).where(eq(venueFeatures.id, featureId)).get()

  if (!feature) {
    throw createError({ statusCode: 404, statusMessage: 'Venue feature not found' })
  }

  // Delete the feature (cascade will delete related records)
  await db.delete(venueFeatures).where(eq(venueFeatures.id, featureId))

  return { success: true, message: 'Venue feature deleted successfully' }
})

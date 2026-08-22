import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

/** GET /api/venue-features/:id. Get a venue feature by ID. Public. */
export default defineEventHandler(async (event) => {
  const featureId = getRouterParam(event, 'id')

  if (!featureId) {
    throw createError({ statusCode: 400, statusMessage: 'Feature ID is required' })
  }

  // Features are public - no authentication required

  // Get feature
  const feature = await db.select().from(schema.venueFeatures).where(eq(schema.venueFeatures.id, featureId)).get()

  if (!feature) {
    throw createError({ statusCode: 404, statusMessage: 'Venue feature not found' })
  }

  return feature
})

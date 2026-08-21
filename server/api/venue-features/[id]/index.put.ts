import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { updateVenueFeature } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
})

/** PUT /api/venue-features/:id — update a venue feature. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  const featureId = getRouterParam(event, 'id')

  if (!featureId) {
    throw createError({ statusCode: 400, statusMessage: 'Feature ID is required' })
  }

  // Check if user has permission to update venue features
  await authorize(event, updateVenueFeature)

  // Get the feature
  const feature = await db.select().from(schema.venueFeatures).where(eq(schema.venueFeatures.id, featureId)).get()

  if (!feature) {
    throw createError({ statusCode: 404, statusMessage: 'Venue feature not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)

  // Check if name is already taken by another feature
  if (body.name !== undefined && body.name !== feature.name) {
    const existingFeature = await db.select().from(schema.venueFeatures).where(eq(schema.venueFeatures.name, body.name)).get()
    if (existingFeature && existingFeature.id !== featureId) {
      throw createError({ statusCode: 400, statusMessage: 'Feature name is already taken' })
    }
  }

  // Prepare update data
  const updateData: {
    name?: string
    description?: string | null
    icon?: string | null
  } = {}

  if (body.name !== undefined) updateData.name = body.name
  if (body.description !== undefined) updateData.description = body.description
  if (body.icon !== undefined) updateData.icon = body.icon

  // Update feature if there are changes
  if (Object.keys(updateData).length === 0) {
    return feature
  }

  const [updatedFeature] = await db.update(schema.venueFeatures)
    .set(updateData)
    .where(eq(schema.venueFeatures.id, featureId))
    .returning()

  if (!updatedFeature) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to update venue feature' })
  }

  return updatedFeature
})

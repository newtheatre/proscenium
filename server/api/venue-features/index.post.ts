import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createVenueFeature } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  icon: z.string().optional(),
})

/** POST /api/venue-features: create a venue feature. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  // Check if user has permission to create venue features
  await authorize(event, createVenueFeature)

  const { name, description, icon } = await readValidatedBody(event, bodySchema.parse)

  // Check if feature with this name already exists
  const existingFeature = await db.select().from(schema.venueFeatures).where(eq(schema.venueFeatures.name, name)).get()

  if (existingFeature) {
    throw createError({ statusCode: 400, statusMessage: 'Feature with this name already exists' })
  }

  // Insert the new feature
  const [newFeature] = await db.insert(schema.venueFeatures).values({
    name,
    description,
    icon,
  }).returning()

  if (!newFeature) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create venue feature' })
  }

  return newFeature
})

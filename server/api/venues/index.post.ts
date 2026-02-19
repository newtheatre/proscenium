import { venues, venuesToFeatures } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { createVenue } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  description: z.string().optional(),
  featureIds: z.array(z.string()).optional().default([]),
})

export default defineEventHandler(async (event) => {
  // Check if user has permission to create venues
  await authorize(event, createVenue)

  const { name, address, capacity, description, featureIds } = await readValidatedBody(event, bodySchema.parse)

  // Check if venue with this name already exists
  const existingVenue = await db.select().from(venues).where(eq(venues.name, name)).get()

  if (existingVenue) {
    throw createError({ statusCode: 400, statusMessage: 'Venue with this name already exists' })
  }

  // Insert the new venue
  const [newVenue] = await db.insert(venues).values({
    name,
    address,
    capacity,
    description,
  }).returning()

  if (!newVenue) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create venue' })
  }

  // Assign features if provided
  if (featureIds.length > 0) {
    await db.insert(venuesToFeatures).values(
      featureIds.map(featureId => ({
        venueId: newVenue.id,
        featureId,
      })),
    )
  }

  // Get the created venue with features
  const createdVenue = await db.query.venues.findFirst({
    where: (venuesTable, { eq }) => eq(venuesTable.id, newVenue.id),
    with: {
      venuesToFeatures: {
        with: {
          feature: true,
        },
      },
    },
  })

  if (!createdVenue) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to retrieve created venue' })
  }

  // Map to expected format
  return {
    id: createdVenue.id,
    name: createdVenue.name,
    address: createdVenue.address,
    capacity: createdVenue.capacity,
    imageUrl: createdVenue.imageUrl,
    description: createdVenue.description,
    createdAt: createdVenue.createdAt,
    updatedAt: createdVenue.updatedAt,
    features: createdVenue.venuesToFeatures.map((vtf) => vtf.feature),
  }
})

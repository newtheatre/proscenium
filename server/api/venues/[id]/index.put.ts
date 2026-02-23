import { db } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { updateVenue } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  address: z.string().optional().nullable(),
  capacity: z.number().int().positive().optional().nullable(),
  description: z.string().optional().nullable(),
  featureIds: z.array(z.string()).optional(),
})

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

  const body = await readValidatedBody(event, bodySchema.parse)

  // Check if name is already taken by another venue
  if (body.name !== undefined && body.name !== venue.name) {
    const existingVenue = await db.select().from(schema.venues).where(eq(schema.venues.name, body.name)).get()
    if (existingVenue && existingVenue.id !== venueId) {
      throw createError({ statusCode: 400, statusMessage: 'Venue name is already taken' })
    }
  }

  // Prepare update data
  const updateData: {
    name?: string
    address?: string | null
    capacity?: number | null
    description?: string | null
  } = {}

  if (body.name !== undefined) updateData.name = body.name
  if (body.address !== undefined) updateData.address = body.address
  if (body.capacity !== undefined) updateData.capacity = body.capacity
  if (body.description !== undefined) updateData.description = body.description

  // Update venue if there are changes
  if (Object.keys(updateData).length > 0) {
    await db.update(schema.venues)
      .set(updateData)
      .where(eq(schema.venues.id, venueId))
  }

  // Update features if provided
  if (body.featureIds !== undefined) {
    // Delete existing feature associations
    await db.delete(schema.venuesToFeatures).where(eq(schema.venuesToFeatures.venueId, venueId))

    // Insert new feature associations
    if (body.featureIds.length > 0) {
      await db.insert(schema.venuesToFeatures).values(
        body.featureIds.map(featureId => ({
          venueId,
          featureId,
        })),
      )
    }
  }

  // Get updated venue with features
  const updatedVenue = await db.query.venues.findFirst({
    where: (venuesTable, { eq }) => eq(venuesTable.id, venueId),
    with: {
      venuesToFeatures: {
        with: {
          feature: true,
        },
      },
    },
  })

  if (!updatedVenue) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to retrieve updated venue' })
  }

  // Map to expected format
  return formatVenueResponse(updatedVenue)
})

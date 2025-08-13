import prisma from '~~/lib/prisma'
import type { Prisma } from '@prisma/client'

/**
 * Standardised error responses
 */
const dbErrors = {
  notFound: (resource: string) => createError({
    statusCode: 404,
    statusMessage: `${resource} not found`,
  }),

  conflict: (message: string) => createError({
    statusCode: 409,
    statusMessage: message,
  }),

  validation: (message: string, data?: unknown) => createError({
    statusCode: 400,
    statusMessage: message,
    data,
  }),

  unauthorized: () => createError({
    statusCode: 401,
    statusMessage: 'Authentication required',
  }),

  forbidden: (message = 'Insufficient permissions') => createError({
    statusCode: 403,
    statusMessage: message,
  }),

  server: (message = 'Internal server error') => createError({
    statusCode: 500,
    statusMessage: message,
  }),
}

/**
 * Standardised venue selection for consistent data across endpoints
 */
export const venueSelectQuery = {
  id: true,
  name: true,
  address: true,
  capacity: true,
  imageUrl: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  isActive: true,
  venueFeatures: {
    select: {
      id: true,
      name: true,
      description: true,
      icon: true,
      isActive: true,
    },
    where: { isActive: true },
  },
} satisfies Prisma.VenueSelect

/**
 * Venue feature selection for consistent data
 */
export const venueFeatureSelectQuery = {
  id: true,
  name: true,
  description: true,
  icon: true,
  createdAt: true,
  updatedAt: true,
  isActive: true,
} satisfies Prisma.VenueFeatureSelect

/**
 * Type for venue data returned from database with all relations
 */
export type VenueWithRelationsRaw = Prisma.VenueGetPayload<{
  select: typeof venueSelectQuery
}>

/**
 * Type for venue feature data returned from database
 */
export type VenueFeatureRaw = Prisma.VenueFeatureGetPayload<{
  select: typeof venueFeatureSelectQuery
}>

/**
 * Get venue with all relations
 */
export async function getVenueWithRelations(venueId: string): Promise<VenueWithRelationsRaw> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: venueSelectQuery,
  })

  if (!venue) {
    throw dbErrors.notFound('Venue')
  }

  return venue
}

/**
 * Create a new venue with optional features
 */
export async function createVenueWithFeatures(venueData: {
  name: string
  address?: string
  capacity?: number
  imageUrl?: string
  notes?: string
  featureIds?: string[]
}): Promise<VenueWithRelationsRaw> {
  // Check if venue name already exists
  const existingVenue = await prisma.venue.findUnique({
    where: { name: venueData.name },
    select: { id: true },
  })

  if (existingVenue) {
    throw dbErrors.conflict('A venue with this name already exists')
  }

  // Validate feature IDs if provided
  if (venueData.featureIds && venueData.featureIds.length > 0) {
    const existingFeatures = await prisma.venueFeature.findMany({
      where: {
        id: { in: venueData.featureIds },
        isActive: true,
      },
      select: { id: true },
    })

    if (existingFeatures.length !== venueData.featureIds.length) {
      throw dbErrors.validation('One or more venue features do not exist or are inactive')
    }
  }

  // Create venue with features
  const venue = await prisma.venue.create({
    data: {
      name: venueData.name,
      address: venueData.address,
      capacity: venueData.capacity,
      imageUrl: venueData.imageUrl,
      notes: venueData.notes,
      venueFeatures: venueData.featureIds
        ? {
            connect: venueData.featureIds.map(id => ({ id })),
          }
        : undefined,
    },
    select: venueSelectQuery,
  })

  return venue
}

/**
 * Update venue with features using batch transactions
 */
export async function updateVenueWithFeatures(
  venueId: string,
  updates: {
    name?: string
    address?: string
    capacity?: number | null
    imageUrl?: string
    notes?: string
    isActive?: boolean
    featureIds?: string[]
  },
): Promise<VenueWithRelationsRaw> {
  // Check if venue exists
  const existingVenue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true },
  })

  if (!existingVenue) {
    throw dbErrors.notFound('Venue')
  }

  // Check name uniqueness if name is being updated
  if (updates.name && updates.name !== existingVenue.name) {
    const nameConflict = await prisma.venue.findUnique({
      where: { name: updates.name },
      select: { id: true },
    })

    if (nameConflict) {
      throw dbErrors.conflict('A venue with this name already exists')
    }
  }

  // Validate feature IDs if provided
  if (updates.featureIds && updates.featureIds.length > 0) {
    const existingFeatures = await prisma.venueFeature.findMany({
      where: {
        id: { in: updates.featureIds },
        isActive: true,
      },
      select: { id: true },
    })

    if (existingFeatures.length !== updates.featureIds.length) {
      throw dbErrors.validation('One or more venue features do not exist or are inactive')
    }
  }

  // Prepare update data
  const updateData: Record<string, unknown> = {}

  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.address !== undefined) updateData.address = updates.address
  if (updates.capacity !== undefined) updateData.capacity = updates.capacity
  if (updates.imageUrl !== undefined) updateData.imageUrl = updates.imageUrl
  if (updates.notes !== undefined) updateData.notes = updates.notes
  if (updates.isActive !== undefined) updateData.isActive = updates.isActive

  // Handle venue features update
  if (updates.featureIds !== undefined) {
    // Replace all existing features with new ones
    updateData.venueFeatures = {
      set: updates.featureIds.map(id => ({ id })),
    }
  }

  // Update venue
  const updatedVenue = await prisma.venue.update({
    where: { id: venueId },
    data: updateData,
    select: venueSelectQuery,
  })

  return updatedVenue
}

/**
 * Check if venue name exists for a different venue
 */
export async function venueNameExistsForOther(name: string, excludeVenueId?: string): Promise<boolean> {
  const existingVenue = await prisma.venue.findUnique({
    where: { name },
    select: { id: true },
  })

  return existingVenue !== null && existingVenue.id !== excludeVenueId
}

/**
 * Get venue feature with associated venues
 */
export async function getVenueFeatureWithVenues(featureId: string) {
  const feature = await prisma.venueFeature.findUnique({
    where: { id: featureId },
    include: {
      venues: {
        select: {
          id: true,
          name: true,
          address: true,
          capacity: true,
          isActive: true,
        },
        where: { isActive: true },
      },
    },
  })

  if (!feature) {
    throw dbErrors.notFound('Venue feature')
  }

  return feature
}

/**
 * Create a new venue feature
 */
export async function createVenueFeature(featureData: {
  name: string
  description?: string
  icon?: string
}): Promise<VenueFeatureRaw> {
  // Check if feature name already exists
  const existingFeature = await prisma.venueFeature.findUnique({
    where: { name: featureData.name },
    select: { id: true },
  })

  if (existingFeature) {
    throw dbErrors.conflict('A venue feature with this name already exists')
  }

  // Create venue feature
  const feature = await prisma.venueFeature.create({
    data: {
      name: featureData.name,
      description: featureData.description,
      icon: featureData.icon,
    },
    select: venueFeatureSelectQuery,
  })

  return feature
}

/**
 * Update venue feature
 */
export async function updateVenueFeature(
  featureId: string,
  updates: {
    name?: string
    description?: string
    icon?: string
    isActive?: boolean
  },
): Promise<VenueFeatureRaw> {
  // Check if feature exists
  const existingFeature = await prisma.venueFeature.findUnique({
    where: { id: featureId },
    select: { id: true, name: true },
  })

  if (!existingFeature) {
    throw dbErrors.notFound('Venue feature')
  }

  // Check name uniqueness if name is being updated
  if (updates.name && updates.name !== existingFeature.name) {
    const nameConflict = await prisma.venueFeature.findUnique({
      where: { name: updates.name },
      select: { id: true },
    })

    if (nameConflict) {
      throw dbErrors.conflict('A venue feature with this name already exists')
    }
  }

  // Prepare update data
  const updateData: Record<string, unknown> = {}

  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.icon !== undefined) updateData.icon = updates.icon
  if (updates.isActive !== undefined) updateData.isActive = updates.isActive

  // Update venue feature
  const updatedFeature = await prisma.venueFeature.update({
    where: { id: featureId },
    data: updateData,
    select: venueFeatureSelectQuery,
  })

  return updatedFeature
}

/**
 * Check if venue feature name exists for a different feature
 */
export async function venueFeatureNameExistsForOther(name: string, excludeFeatureId?: string): Promise<boolean> {
  const existingFeature = await prisma.venueFeature.findUnique({
    where: { name },
    select: { id: true },
  })

  return existingFeature !== null && existingFeature.id !== excludeFeatureId
}

/**
 * Content Warning database utilities
 */
import prisma from '~~/server/database'
import type { Prisma } from '~~/prisma/generated/client'
import { dbErrors } from './index'

/**
 * Content warning creation data
 */
export interface ContentWarningCreateData {
  name: string
  description?: string | null
  icon?: string | null
  isActive?: boolean
}

/**
 * Content warning update data
 */
export interface ContentWarningUpdateData {
  name?: string
  description?: string | null
  icon?: string | null
  isActive?: boolean
}

/**
 * Content warning query options
 */
export interface ContentWarningQueryOptions {
  search?: string
  isActive?: boolean
  sortBy?: 'name' | 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  skip?: number
  includeUsageStats?: boolean
}

/**
 * Standardised content warning selection for consistent data across endpoints
 */
export const contentWarningSelectQuery = {
  id: true,
  name: true,
  description: true,
  icon: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  shows: {
    select: {
      show: {
        select: {
          id: true,
          title: true,
          slug: true,
        },
      },
    },
  },
} satisfies Prisma.ContentWarningSelect

/**
 * Type for content warning data returned from database with all relations
 */
export type ContentWarningWithRelationsRaw = Prisma.ContentWarningGetPayload<{
  select: typeof contentWarningSelectQuery
}>

/**
 * Get content warning with all relations
 */
export async function getContentWarningWithRelations(id: string): Promise<ContentWarningWithRelationsRaw> {
  const contentWarning = await prisma.contentWarning.findUnique({
    where: { id },
    select: contentWarningSelectQuery,
  })

  if (!contentWarning) {
    throw dbErrors.notFound('Content warning')
  }

  return contentWarning
}

/**
 * Get multiple content warnings with filtering and pagination
 */
export async function getContentWarnings(options: ContentWarningQueryOptions = {}) {
  const {
    search,
    isActive,
    sortBy = 'name',
    sortOrder = 'asc',
    limit = 25,
    skip = 0,
  } = options

  // Build where clause
  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
    ]
  }

  if (isActive !== undefined) {
    where.isActive = isActive
  }

  // Build order by
  let orderBy: Record<string, string>
  switch (sortBy) {
    case 'name':
      orderBy = { name: sortOrder }
      break
    case 'updatedAt':
      orderBy = { updatedAt: sortOrder }
      break
    case 'createdAt':
    default:
      orderBy = { createdAt: sortOrder }
      break
  }

  const [contentWarnings, total] = await Promise.all([
    prisma.contentWarning.findMany({
      where,
      select: contentWarningSelectQuery,
      orderBy,
      skip,
      take: limit,
    }),
    prisma.contentWarning.count({ where }),
  ])

  return { contentWarnings, total }
}

/**
 * Create a new content warning with relations
 */
export async function createContentWarningWithRelations(data: ContentWarningCreateData): Promise<ContentWarningWithRelationsRaw> {
  const { name, description, icon, isActive = true } = data

  // Validate required fields
  if (!name?.trim()) {
    throw dbErrors.validation('Content warning name is required')
  }

  const trimmedName = name.trim()

  // Check if name already exists
  const existingWarning = await prisma.contentWarning.findUnique({
    where: { name: trimmedName },
    select: { id: true },
  })

  if (existingWarning) {
    throw dbErrors.conflict('A content warning with this name already exists')
  }

  const contentWarning = await prisma.contentWarning.create({
    data: {
      name: trimmedName,
      description: description?.trim() || null,
      icon: icon?.trim() || null,
      isActive: Boolean(isActive),
    },
    select: contentWarningSelectQuery,
  })

  return contentWarning
}

/**
 * Update content warning with relations
 */
export async function updateContentWarningWithRelations(
  id: string,
  updates: ContentWarningUpdateData,
): Promise<ContentWarningWithRelationsRaw> {
  // Check if the content warning exists
  const existingWarning = await prisma.contentWarning.findUnique({
    where: { id },
    select: { id: true, name: true },
  })

  if (!existingWarning) {
    throw dbErrors.notFound('Content warning')
  }

  const { name, description, icon, isActive } = updates

  // Check if new name conflicts with existing (if name is being changed)
  if (name && name.trim() !== existingWarning.name) {
    const nameConflict = await prisma.contentWarning.findUnique({
      where: { name: name.trim() },
      select: { id: true },
    })

    if (nameConflict) {
      throw dbErrors.conflict('A content warning with this name already exists')
    }
  }

  // Build update data only for provided fields
  const updateData: Record<string, unknown> = {}

  if (name !== undefined) {
    updateData.name = name.trim()
  }

  if (description !== undefined) {
    updateData.description = description?.trim() || null
  }

  if (icon !== undefined) {
    updateData.icon = icon?.trim() || null
  }

  if (isActive !== undefined) {
    updateData.isActive = Boolean(isActive)
  }

  // Only update if there are changes
  if (Object.keys(updateData).length === 0) {
    return await getContentWarningWithRelations(id)
  }

  const contentWarning = await prisma.contentWarning.update({
    where: { id },
    data: updateData,
    select: contentWarningSelectQuery,
  })

  return contentWarning
}

/**
 * Delete a content warning
 */
export async function deleteContentWarning(id: string) {
  // Check if the content warning exists
  const existingWarning = await prisma.contentWarning.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          shows: true,
        },
      },
    },
  })

  if (!existingWarning) {
    throw dbErrors.notFound('Content warning')
  }

  // Check if it's being used by shows
  if (existingWarning._count.shows > 0) {
    throw dbErrors.conflict('Cannot delete content warning that is currently in use by shows')
  }

  await prisma.contentWarning.delete({
    where: { id },
  })

  return existingWarning
}

/**
 * Get content warnings that are active and available for use
 */
export async function getActiveContentWarnings() {
  return await prisma.contentWarning.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      icon: true,
    },
    orderBy: { name: 'asc' },
  })
}

/**
 * Check if content warning name exists for a different warning
 */
export async function contentWarningNameExistsForOther(name: string, excludeId?: string): Promise<boolean> {
  const existingWarning = await prisma.contentWarning.findUnique({
    where: { name: name.trim() },
    select: { id: true },
  })

  return existingWarning !== null && existingWarning.id !== excludeId
}

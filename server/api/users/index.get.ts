import prisma from '~~/lib/prisma'
import type { MembershipType, RoleType, Prisma } from '@prisma/client'

/**
 * GET /api/users
 *
 * Retrieves a paginated list of users with support for filtering, searching, and sorting.
 *
 * Query Parameters:
 * @param {number} page - Page number (default: 1, min: 1)
 * @param {number} limit - Items per page (default: 10, min: 1, max: 100)
 * @param {string} search - Search term for email, name, studentId, or profile name
 * @param {string} role - Filter by user role (ADMIN, MANAGER, TRAINER)
 * @param {string} membershipType - Filter by membership type (FULL, ASSOCIATE, FELLOW, ALUMNI, GUEST, UNKNOWN)
 * @param {boolean} isActive - Filter by active status (true/false)
 * @param {string} sortBy - Field to sort by (default: createdAt)
 * @param {string} sortOrder - Sort direction: asc or desc (default: desc)
 *
 * Sortable fields:
 * - createdAt, updatedAt, lastLogin, email, name, studentId, isActive
 * - membershipType (sorts by membership.type)
 * - profileName (sorts by profile.name)
 *
 * Response:
 * {
 *   success: boolean,
 *   data: User[],
 *   pagination: {
 *     page: number,
 *     total: number,
 *     pages: number
 *   }
 * }
 *
 * Error Responses:
 * - 401: Unauthorized (if user is not authenticated)
 * - 403: Forbidden (if user does not have ADMIN role)
 * - 400: Invalid query parameters
 * - 500: Database or server error
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, 'ADMIN')

  try {
    const query = getQuery(event)

    // Validate and parse pagination parameters
    const page = Math.max(1, parseInt(query.page as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 10))

    if (isNaN(page) || isNaN(limit)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid pagination parameters. Page and limit must be valid numbers.',
      })
    }

    const skip = (page - 1) * limit

    // Validate and parse sorting parameters
    const validSortFields = ['createdAt', 'updatedAt', 'lastLogin', 'email', 'studentId', 'isActive', 'membership.type', 'profile.name']
    const sortBy = (query.sortBy as string) || 'createdAt'
    const sortOrder = (query.sortOrder as string) === 'asc' ? 'asc' : 'desc'

    if (!validSortFields.includes(sortBy)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid sortBy field. Must be one of: ${validSortFields.join(', ')}`,
      })
    }

    // Validate filtering parameters
    const search = query.search as string
    const role = query.role as string
    const membershipType = query.membershipType as string

    // Validate role if provided
    const validRoles = ['ADMIN', 'MANAGER', 'TRAINER']
    if (role && !validRoles.includes(role)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
      })
    }

    // Validate membership type if provided
    const validMembershipTypes = ['FULL', 'ASSOCIATE', 'FELLOW', 'ALUMNI', 'GUEST', 'UNKNOWN']
    if (membershipType && !validMembershipTypes.includes(membershipType)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid membershipType. Must be one of: ${validMembershipTypes.join(', ')}`,
      })
    }

    // Parse isActive parameter
    let isActive: boolean | undefined
    if (query.isActive === 'true') {
      isActive = true
    }
    else if (query.isActive === 'false') {
      isActive = false
    }
    else if (query.isActive !== undefined) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid isActive parameter. Must be "true" or "false".',
      })
    }
    // Build where clause for filtering
    const where: Prisma.UserWhereInput = {}

    // Search across multiple fields
    if (search) {
      where.OR = [
        { email: { contains: search } },
        { studentId: { contains: search } },
        { profile: { name: { contains: search } } },
      ]
    }

    // Apply filters
    if (isActive !== undefined) {
      where.isActive = isActive
    }

    if (role && validRoles.includes(role)) {
      where.roles = {
        some: { role: role as RoleType },
      }
    }

    if (membershipType) {
      where.membership = {
        type: membershipType as MembershipType,
      }
    }

    // Build orderBy clause
    const orderBy: Prisma.UserOrderByWithRelationInput = {}

    if (sortBy === 'membership.type') {
      orderBy.membership = { type: sortOrder }
    }
    else if (sortBy === 'profile.name') {
      orderBy.profile = { name: sortOrder }
    }
    else {
      (orderBy as Record<string, Prisma.SortOrder>)[sortBy] = sortOrder as Prisma.SortOrder
    }

    // Execute database queries
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          roles: true,
          membership: true,
          profile: {
            include: {
              socialLinks: true,
            },
          },
        },
        omit: {
          password: true,
        },
      }),
      prisma.user.count({ where }),
    ])

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit)

    return {
      success: true,
      data: users,
      meta: {
        page,
        pages: totalPages,
        count: totalCount,
      },
    }
  }
  catch (error) {
    // Handle known errors
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    // Handle Prisma-specific errors
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      throw createError({
        statusCode: 404,
        statusMessage: 'Resource not found',
      })
    }

    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && error.code.startsWith('P2')) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Database query error. Please check your parameters.',
      })
    }

    // Handle unexpected errors
    console.error('Unexpected error in /api/users:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'An unexpected error occurred while fetching users',
    })
  }
})

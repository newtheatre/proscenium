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
 *     pages: number,
 *     limit: number
 *   },
 *   message?: string
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
    const { page, limit, skip } = validatePagination(query)

    // Validate and parse sorting parameters
    const validSortFields = ['createdAt', 'updatedAt', 'lastLogin', 'email', 'studentId', 'isActive', 'membership.type', 'profile.name']
    const { sortBy, sortOrder } = validateSort(query, validSortFields)

    // Validate filtering parameters
    const search = query.search as string
    const role = query.role as string
    const membershipType = query.membershipType as string

    // Validate role if provided
    const validRoles = ['ADMIN', 'MANAGER', 'TRAINER']
    if (role && !validRoles.includes(role)) {
      throw dbErrors.validation(`Invalid role. Must be one of: ${validRoles.join(', ')}`)
    }

    // Validate membership type if provided
    const validMembershipTypes = ['FULL', 'ASSOCIATE', 'FELLOW', 'ALUMNI', 'GUEST', 'UNKNOWN']
    if (membershipType && !validMembershipTypes.includes(membershipType)) {
      throw dbErrors.validation(`Invalid membershipType. Must be one of: ${validMembershipTypes.join(', ')}`)
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
      throw dbErrors.validation('Invalid isActive parameter. Must be "true" or "false".')
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
        select: userSelectQuery,
      }),
      prisma.user.count({ where }),
    ])

    // Transform users to safe format
    const safeUsers = users.map(user => safeUserData(user))

    return paginatedResponse(
      safeUsers,
      {
        page,
        total: totalCount,
        limit,
      },
      'Users retrieved successfully',
    )
  }
  catch (error: unknown) {
    return handleApiError(error, 'Users list retrieval')
  }
})

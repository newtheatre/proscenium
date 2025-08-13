import prisma from '~~/lib/prisma'

/**
 * GET /api/venues
 *
 * Retrieves a paginated list of venues with support for filtering, searching, and sorting.
 *
 * Query Parameters:
 * @param {number} page - Page number (default: 1, min: 1)
 * @param {number} limit - Items per page (default: 10, min: 1, max: 100)
 * @param {string} search - Search term for venue name, address, or notes
 * @param {boolean} isActive - Filter by active status (true/false)
 * @param {boolean} hasCapacity - Filter venues that have capacity defined
 * @param {string} feature - Filter by venue feature name
 * @param {string} sortBy - Field to sort by (default: createdAt)
 * @param {string} sortOrder - Sort direction: asc or desc (default: desc)
 *
 * Sortable fields:
 * - createdAt, updatedAt, name, capacity, address
 *
 * Response:
 * {
 *   success: boolean,
 *   data: Venue[],
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
  try {
    await requireRole(event, 'ADMIN')

    const query = getQuery(event)

    // Parse and validate query parameters
    const { page, limit, skip } = validatePagination(query)
    const search = query.search as string || ''
    const isActive = query.isActive === undefined ? undefined : query.isActive === 'true'
    const hasCapacity = query.hasCapacity === undefined ? undefined : query.hasCapacity === 'true'
    const feature = query.feature as string || ''

    // Validate and set sorting
    const allowedSortFields = ['createdAt', 'updatedAt', 'name', 'capacity', 'address']
    const { sortBy, sortOrder } = validateSort(query, allowedSortFields)

    // skip is calculated by validatePagination    // Build where clause
    const where: Record<string, unknown> = {}

    // Active status filter
    if (isActive !== undefined) {
      where.isActive = isActive
    }

    // Capacity filter
    if (hasCapacity !== undefined) {
      where.capacity = hasCapacity ? { not: null } : null
    }

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Feature filter
    if (feature) {
      where.venueFeatures = {
        some: {
          name: { contains: feature, mode: 'insensitive' },
          isActive: true,
        },
      }
    }

    // Build orderBy clause
    const orderBy: Record<string, string> = {}
    orderBy[sortBy] = sortOrder

    // Execute queries
    const [venues, total] = await Promise.all([
      prisma.venue.findMany({
        where,
        select: venueSelectQuery,
        skip,
        take: limit,
        orderBy,
      }),
      prisma.venue.count({ where }),
    ])

    return paginatedResponse(
      venues,
      { page, total, limit },
    )
  }
  catch (error) {
    return handleApiError(error)
  }
})

import prisma from '~~/lib/prisma'

/**
 * GET /api/venues/features
 *
 * Retrieves a paginated list of venue features with support for filtering, searching, and sorting.
 *
 * Query Parameters:
 * @param {number} page - Page number (default: 1, min: 1)
 * @param {number} limit - Items per page (default: 10, min: 1, max: 100)
 * @param {string} search - Search term for feature name or description
 * @param {boolean} isActive - Filter by active status (true/false)
 * @param {string} sortBy - Field to sort by (default: createdAt)
 * @param {string} sortOrder - Sort direction: asc or desc (default: desc)
 *
 * Sortable fields:
 * - createdAt, updatedAt, name
 *
 * Response:
 * {
 *   success: boolean,
 *   data: VenueFeature[],
 *   pagination: {
 *     page: number,
 *     total: number,
 *     pages: number,
 *     limit: number
 *   }
 * }
 *
 * Access Control:
 * - Any authenticated user can view venue features
 *
 * Error Responses:
 * - 401: Unauthorized (if user is not authenticated)
 * - 400: Invalid query parameters
 * - 500: Database or server error
 */
export default defineEventHandler(async (event) => {
  try {
    await requireAuth(event)

    const query = getQuery(event)

    // Parse and validate query parameters
    const { page, limit, skip } = validatePagination(query)
    const search = query.search as string || ''
    const isActive = query.isActive === undefined ? undefined : query.isActive === 'true'

    // Validate and set sorting
    const allowedSortFields = ['createdAt', 'updatedAt', 'name']
    const { sortBy, sortOrder } = validateSort(query, allowedSortFields)

    // skip is calculated by validatePagination    // Build where clause
    const where: Record<string, unknown> = {}

    // Active status filter
    if (isActive !== undefined) {
      where.isActive = isActive
    }

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Build orderBy clause
    const orderBy: Record<string, string> = {}
    orderBy[sortBy] = sortOrder

    // Execute queries
    const [features, total] = await Promise.all([
      prisma.venueFeature.findMany({
        where,
        select: {
          ...venueFeatureSelectQuery,
          _count: {
            select: {
              venues: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy,
      }),
      prisma.venueFeature.count({ where }),
    ])

    return paginatedResponse(
      features,
      { page, total, limit },
    )
  }
  catch (error) {
    return handleApiError(error)
  }
})

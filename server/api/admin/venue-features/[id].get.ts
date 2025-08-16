/**
 * GET /api/venue-features/[id]
 *
 * Retrieves a specific venue feature's information.
 *
 * Path Parameters:
 * @param {string} id - Venue feature ID to retrieve
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     feature: {
 *       id: string,
 *       name: string,
 *       description?: string,
 *       icon?: string,
 *       createdAt: DateTime,
 *       updatedAt: DateTime,
 *       isActive: boolean,
 *       venues: Venue[]
 *     }
 *   }
 * }
 *
 * Access Control:
 * - Any authenticated user can view venue feature information
 *
 * Error Responses:
 * - 400: Missing feature ID
 * - 401: Authentication required
 * - 404: Venue feature not found
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  try {
    await requireAuth(event)

    const featureId = getRouterParam(event, 'id')
    if (!featureId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Feature ID is required',
      })
    }

    // Get venue feature with associated venues using database utility
    const feature = await getVenueFeatureWithVenues(featureId)

    return successResponse({ feature })
  }
  catch (error) {
    return handleApiError(error)
  }
})

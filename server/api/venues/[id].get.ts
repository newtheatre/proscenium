/**
 * GET /api/venues/[id]
 *
 * Retrieves a specific venue's information.
 *
 * Path Parameters:
 * @param {string} id - Venue ID to retrieve
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     venue: {
 *       id: string,
 *       name: string,
 *       address?: string,
 *       capacity?: number,
 *       imageUrl?: string,
 *       notes?: string,
 *       createdAt: DateTime,
 *       updatedAt: DateTime,
 *       isActive: boolean,
 *       venueFeatures: VenueFeature[]
 *     }
 *   }
 * }
 *
 * Access Control:
 * - Any authenticated user can view venue information
 *
 * Error Responses:
 * - 400: Missing venue ID
 * - 401: Authentication required
 * - 404: Venue not found
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  try {
    await requireAuth(event)

    const venueId = getRouterParam(event, 'id')
    if (!venueId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Venue ID is required',
      })
    }

    // Get venue with all features using database utility
    const venue = await getVenueWithRelations(venueId)

    return successResponse({ venue })
  }
  catch (error) {
    return handleApiError(error)
  }
})

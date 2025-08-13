import { successResponse, handleApiError } from '../../utils/responses'
import { requireRole } from '../../utils/guards'
import { updateVenueWithFeatures } from '../../utils/database/venue'

/**
 * DELETE /api/venues/[id]
 *
 * Admin-only endpoint to deactivate a venue (soft delete).
 * This sets the venue's isActive status to false rather than permanently deleting it.
 *
 * Path Parameters:
 * @param {string} id - Venue ID to deactivate
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     venue: {
 *       id: string,
 *       name: string,
 *       isActive: boolean
 *     }
 *   },
 *   message: string
 * }
 *
 * Process:
 * 1. Validates admin role
 * 2. Checks if venue exists and is currently active
 * 3. Sets venue isActive status to false
 * 4. Returns confirmation of deactivation
 *
 * Error Responses:
 * - 400: Missing venue ID or venue already inactive
 * - 401: Unauthorized (if user is not authenticated)
 * - 403: Forbidden (if user does not have ADMIN role)
 * - 404: Venue not found
 * - 500: Database or server error
 */
export default defineEventHandler(async (event) => {
  try {
    await requireRole(event, 'ADMIN')

    const venueId = getRouterParam(event, 'id')
    if (!venueId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Venue ID is required',
      })
    }

    // Deactivate venue using database utility
    const deactivatedVenue = await updateVenueWithFeatures(venueId, {
      isActive: false,
    })

    return successResponse(
      {
        venue: {
          id: deactivatedVenue.id,
          name: deactivatedVenue.name,
          isActive: deactivatedVenue.isActive,
        },
      },
      'Venue deactivated successfully',
    )
  }
  catch (error) {
    return handleApiError(error)
  }
})

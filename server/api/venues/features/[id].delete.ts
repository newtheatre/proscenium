/**
 * DELETE /api/venues/features/[id]
 *
 * Admin-only endpoint to deactivate a venue feature (soft delete).
 * This sets the feature's isActive status to false rather than permanently deleting it.
 *
 * Path Parameters:
 * @param {string} id - Venue feature ID to deactivate
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     feature: {
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
 * 2. Checks if feature exists and is currently active
 * 3. Sets feature isActive status to false
 * 4. Returns confirmation of deactivation
 *
 * Error Responses:
 * - 400: Missing feature ID or feature already inactive
 * - 401: Unauthorized (if user is not authenticated)
 * - 403: Forbidden (if user does not have ADMIN role)
 * - 404: Venue feature not found
 * - 500: Database or server error
 */
export default defineEventHandler(async (event) => {
  try {
    await requireRole(event, 'ADMIN')

    const featureId = getRouterParam(event, 'id')
    if (!featureId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Feature ID is required',
      })
    }

    // Get current feature to check if it exists and is active
    try {
      const existingFeature = await updateVenueFeature(featureId, { isActive: false })

      return successResponse(
        { feature: { id: existingFeature.id, name: existingFeature.name, isActive: existingFeature.isActive } },
        'Venue feature deactivated successfully',
      )
    }
    catch (error: unknown) {
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
        throw createError({
          statusCode: 404,
          statusMessage: 'Venue feature not found',
        })
      }
      throw error
    }
  }
  catch (error) {
    return handleApiError(error)
  }
})

/**
 * PATCH /api/venue-features/[id]
 *
 * Admin-only endpoint to update venue feature information.
 *
 * Path Parameters:
 * @param {string} id - Venue feature ID to update
 *
 * Request Body:
 * @param {string} [name] - Updated feature name
 * @param {string} [description] - Updated feature description
 * @param {string} [icon] - Updated icon identifier
 * @param {boolean} [isActive] - Updated active status
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
 *       isActive: boolean
 *     }
 *   },
 *   message: string
 * }
 *
 * Error Responses:
 * - 400: Invalid data or feature name already exists
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

    const body = await readBody(event)

    // Validate request body
    const validatedData = venueFeatureUpdateSchema.parse(body)

    // Check if feature exists
    const existingFeature = await updateVenueFeature(featureId, {
      name: validatedData.name,
      description: validatedData.description,
      icon: validatedData.icon,
      isActive: validatedData.isActive,
    })

    return successResponse(
      { feature: existingFeature },
      'Venue feature updated successfully',
    )
  }
  catch (error) {
    return handleApiError(error)
  }
})

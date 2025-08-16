/**
 * PATCH /api/venues/[id]
 *
 * Admin-only endpoint to update venue information.
 *
 * Path Parameters:
 * @param {string} id - Venue ID to update
 *
 * Request Body:
 * @param {string} [name] - Updated venue name
 * @param {string} [address] - Updated venue address
 * @param {number|null} [capacity] - Updated default seating capacity (null to remove)
 * @param {string} [imageUrl] - Updated image URL
 * @param {string} [notes] - Updated notes
 * @param {boolean} [isActive] - Updated active status
 * @param {string[]} [featureIds] - Array of venue feature IDs to associate (replaces existing)
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
 *   },
 *   message: string
 * }
 *
 * Process:
 * 1. Validates admin role and input data
 * 2. Checks for venue name uniqueness conflicts (if name is being changed)
 * 3. Validates venue feature IDs (if being updated)
 * 4. Updates venue data and feature associations
 * 5. Returns updated venue data
 *
 * Error Responses:
 * - 400: Invalid data or venue name already exists
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

    const body = await readBody(event)

    // Validate request body
    const validatedData = venueUpdateSchema.parse(body)

    // Update venue using database utility
    const updatedVenue = await updateVenueWithFeatures(venueId, {
      name: validatedData.name,
      address: validatedData.address,
      capacity: validatedData.capacity,
      imageUrl: validatedData.imageUrl,
      notes: validatedData.notes,
      isActive: validatedData.isActive,
      featureIds: validatedData.featureIds,
    })

    return successResponse(
      { venue: updatedVenue },
      'Venue updated successfully',
    )
  }
  catch (error) {
    return handleApiError(error)
  }
})

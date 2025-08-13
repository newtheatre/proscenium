import { successResponse, handleApiError } from '../../../utils/responses'
import { requireRole } from '../../../utils/guards'
import { createVenueFeature } from '../../../utils/database/venue'
import { venueFeatureCreateSchema } from '../../../utils/validation'

/**
 * POST /api/venues/features
 *
 * Creates a new venue feature.
 *
 * Request Body:
 * @param {string} name - Feature name (required, unique)
 * @param {string} [description] - Feature description
 * @param {string} [icon] - Icon identifier (emoji or icon class name)
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
 * - 400: Invalid request data or feature name already exists
 * - 401: Unauthorized (if user is not authenticated)
 * - 403: Forbidden (if user does not have ADMIN role)
 * - 500: Database or server error
 */
export default defineEventHandler(async (event) => {
  try {
    await requireRole(event, 'ADMIN')

    const body = await readBody(event)

    // Validate request body
    const validatedData = venueFeatureCreateSchema.parse(body)

    // Create venue feature using database utility
    const feature = await createVenueFeature({
      name: validatedData.name,
      description: validatedData.description,
      icon: validatedData.icon,
    })

    return successResponse(
      { feature },
      'Venue feature created successfully',
    )
  }
  catch (error) {
    return handleApiError(error)
  }
})

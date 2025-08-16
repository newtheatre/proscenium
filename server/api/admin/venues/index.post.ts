import { successResponse, handleApiError } from '../../utils/responses'
import { requireRole } from '../../utils/guards'

/**
 * POST /api/venues
 *
 * Creates a new venue with optional venue features.
 *
 * Request Body:
 * @param {string} name - Venue name (required, unique)
 * @param {string} [address] - Venue address
 * @param {number} [capacity] - Default seating capacity
 * @param {string} [imageUrl] - URL to venue image
 * @param {string} [notes] - Additional notes about the venue
 * @param {string[]} [featureIds] - Array of venue feature IDs to associate
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
 * Error Responses:
 * - 400: Invalid request data or venue name already exists
 * - 401: Unauthorized (if user is not authenticated)
 * - 403: Forbidden (if user does not have ADMIN role)
 * - 500: Database or server error
 */
export default defineEventHandler(async (event) => {
  try {
    await requireRole(event, 'ADMIN')

    const body = await readBody(event)

    // Validate request body
    const validatedData = venueCreateSchema.parse(body)

    // Create venue using database utility
    const venue = await createVenueWithFeatures({
      name: validatedData.name,
      address: validatedData.address,
      capacity: validatedData.capacity,
      imageUrl: validatedData.imageUrl,
      notes: validatedData.notes,
      featureIds: validatedData.featureIds,
    })

    return successResponse(
      { venue },
      'Venue created successfully',
    )
  }
  catch (error) {
    return handleApiError(error)
  }
})

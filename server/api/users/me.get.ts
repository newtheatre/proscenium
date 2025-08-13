import { successResponse, handleApiError, safeUserData } from '../../utils/responses'
import { requireAuth } from '../../utils/guards'

/**
 * GET /api/users/me
 *
 * Retrieves the current authenticated user's complete information from the database.
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     user: {
 *       id: string,
 *       email: string,
 *       emailVerified: boolean,
 *       setupCompleted: boolean,
 *       roles: RoleType[],
 *       profile: Profile | null,
 *       membership: Membership | null
 *     }
 *   }
 * }
 *
 * Process:
 * 1. Authenticates the user from session
 * 2. Fetches complete user data with all relations from database
 * 3. Returns sanitized user data
 *
 * Error Responses:
 * - 401: Authentication required
 * - 404: User not found in database
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  try {
    // Get authenticated user from session (minimal data)
    const sessionUser = await requireAuth(event)

    // Fetch complete user data from database with all relations
    const userData = await getUserWithRelations(sessionUser.id)

    return successResponse({
      user: safeUserData(userData),
    })
  }
  catch (error: unknown) {
    return handleApiError(error, 'Current user retrieval')
  }
})

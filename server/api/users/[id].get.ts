import { successResponse, handleApiError, safeUserData, cleanUserData, restrictedUserData } from '../../utils/responses'
import { dbErrors } from '../../utils/database'
import { requireAuth } from '../../utils/guards'

/**
 * GET /api/users/[id]
 *
 * Retrieves a specific user's information based on permissions.
 *
 * Path Parameters:
 * @param {string} id - User ID to retrieve
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     user: User // Full user data for admin/owner, limited for others
 *   }
 * }
 *
 * Access Control:
 * - Admin: Full user information including sensitive data
 * - Owner: Full personal information (excluding admin-only fields)
 * - Others: Public profile information only
 *
 * Error Responses:
 * - 400: Missing user ID
 * - 401: Authentication required
 * - 404: User not found
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  try {
    const currentUser = await requireAuth(event)
    const userId = getRouterParam(event, 'id')
    if (!userId) {
      // Should never happen due to route, but handle gracefully
      throw dbErrors.validation('User ID is required')
    }

    // Get user with all relations
    const targetUser = await getUserWithRelations(userId)

    // Check permissions
    const isAdmin = currentUser.roles.includes('ADMIN')
    const isOwner = currentUser.id === userId

    console.log(`User retrieval: ${currentUser.id} accessing ${userId} - Admin: ${isAdmin}, Owner: ${isOwner}`)

    if (isAdmin) {
      // Admin gets full user information
      return successResponse({
        user: safeUserData(targetUser),
      })
    }
    else if (isOwner) {
      // User gets their own full information
      return successResponse({
        user: cleanUserData(targetUser),
      })
    }
    else {
      // Regular users get only public information
      return successResponse({
        user: restrictedUserData(targetUser),
      })
    }
  }
  catch (error: unknown) {
    return handleApiError(error, 'User retrieval')
  }
})

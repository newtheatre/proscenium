/**
 * POST /api/auth/logout
 *
 * Logs out the current user by clearing their session.
 * Requires user to be authenticated.
 *
 * Response:
 * {
 *   success: boolean
 * }
 *
 * Process:
 * 1. Clears the user session from cookies
 * 2. Returns success confirmation
 *
 * Error Responses:
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { success: true }
})

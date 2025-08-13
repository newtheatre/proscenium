import { passwordUpdateSchema } from '../../../utils/validation'
import { dbErrors } from '../../../utils/database'
import { successResponse, handleApiError } from '../../../utils/responses'
import { isValidPassword } from '../../../utils/auth'
import { requireAuth } from '../../../utils/guards'
import prisma from '../../../../lib/prisma'

/**
 * PATCH /api/auth/password/update
 *
 * Updates the current authenticated user's password.
 *
 * Request Body:
 * @param {string} currentPassword - User's current password for verification
 * @param {string} newPassword - New password (min 8 characters with complexity requirements)
 *
 * Response:
 * {
 *   success: boolean,
 *   message: string
 * }
 *
 * Process:
 * 1. Validates authentication
 * 2. Validates input data (current and new passwords)
 * 3. Retrieves user with current password
 * 4. Verifies current password
 * 5. Validates new password strength
 * 6. Updates password using single operation (D1 compatible)
 *
 * Error Responses:
 * - 401: Unauthorized (if user is not authenticated)
 * - 400: Invalid input data or current password incorrect
 * - 404: User not found
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  try {
    // Ensure user is authenticated
    const user = await requireAuth(event)

    const body = await readBody(event)

    // Validate input
    const result = passwordUpdateSchema.safeParse(body)
    if (!result.success) {
      throw dbErrors.validation('Invalid input data', result.error.issues)
    }

    const { currentPassword, newPassword } = result.data

    // Validate new password strength
    const passwordValidation = isValidPassword(newPassword)
    if (!passwordValidation.valid) {
      throw dbErrors.validation(passwordValidation.message!)
    }

    // Get user with password for verification
    const userWithPassword = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        password: true,
      },
    })

    if (!userWithPassword) {
      throw dbErrors.notFound('User')
    }

    // Verify current password
    const isCurrentPasswordValid = await verifyPassword(userWithPassword.password, currentPassword)
    if (!isCurrentPasswordValid) {
      throw dbErrors.validation('Current password is incorrect')
    }

    // Hash the new password
    const hashedNewPassword = await hashPassword(newPassword)

    // Update password using single operation (D1 compatible)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedNewPassword,
      },
    })

    return successResponse(undefined, 'Password updated successfully')
  }
  catch (error: unknown) {
    return handleApiError(error, 'Password update')
  }
})

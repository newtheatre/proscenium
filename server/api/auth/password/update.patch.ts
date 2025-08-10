import { z } from 'zod'
import prisma from '~~/lib/prisma'
import { requireAuth } from '~~/server/utils/guards'
import { isValidPassword } from '~~/server/utils/auth'

/**
 * PATCH /api/auth/password/update
 *
 * Updates the current authenticated user's password.
 *
 * Request Body:
 * @param {string} currentPassword - User's current password for verification
 * @param {string} newPassword - New password (min 8 characters)
 *
 * Response:
 * {
 *   success: boolean,
 *   message: string
 * }
 *
 * Error Responses:
 * - 401: Unauthorized (if user is not authenticated)
 * - 400: Invalid input data or current password incorrect
 * - 500: Internal server error
 */

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
})

export default defineEventHandler(async (event) => {
  try {
    // Ensure user is authenticated
    const user = await requireAuth(event)

    const body = await readBody(event)

    // Validate input
    const result = updatePasswordSchema.safeParse(body)
    if (!result.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid input data',
        data: result.error.issues,
      })
    }

    const { currentPassword, newPassword } = result.data

    // Validate new password strength
    const passwordValidation = isValidPassword(newPassword)
    if (!passwordValidation.valid) {
      throw createError({
        statusCode: 400,
        statusMessage: passwordValidation.message,
      })
    }

    // Get user's current password hash
    const userWithPassword = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    })

    if (!userWithPassword) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found',
      })
    }

    // Verify current password
    const isCurrentPasswordValid = await verifyPassword(userWithPassword.password, currentPassword)
    if (!isCurrentPasswordValid) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Current password is incorrect',
      })
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword)

    // Update password in database
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword },
    })

    return {
      success: true,
      message: 'Password updated successfully',
    }
  }
  catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('Password update error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error',
    })
  }
})

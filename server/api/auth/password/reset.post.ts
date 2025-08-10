import { z } from 'zod'
import prisma from '~~/lib/prisma'
import { isValidPassword, generateVerificationToken, sendPasswordResetEmail } from '~~/server/utils/auth'

/**
 * POST /api/auth/password/reset
 *
 * Initiates or completes a password reset process.
 *
 * Request Body (for initiating reset):
 * @param {string} email - User's email address
 *
 * Request Body (for completing reset):
 * @param {string} token - Password reset token
 * @param {string} newPassword - New password (min 8 characters)
 *
 * Response:
 * {
 *   success: boolean,
 *   message: string
 * }
 *
 * Error Responses:
 * - 400: Invalid input data or expired/invalid token
 * - 404: User not found (only when completing reset with token)
 * - 500: Internal server error
 */

const initiateResetSchema = z.object({
  email: z.string().email('Invalid email format'),
})

const completeResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    // Check if this is a token-based reset completion or email-based reset initiation
    if ('token' in body && 'newPassword' in body) {
      // Complete password reset with token
      const result = completeResetSchema.safeParse(body)
      if (!result.success) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid input data',
          data: result.error.issues,
        })
      }

      const { token, newPassword } = result.data

      // Validate new password strength
      const passwordValidation = isValidPassword(newPassword)
      if (!passwordValidation.valid) {
        throw createError({
          statusCode: 400,
          statusMessage: passwordValidation.message,
        })
      }

      // Find user with valid reset token
      const user = await prisma.user.findFirst({
        where: {
          passwordResetToken: token,
          passwordResetExpires: {
            gt: new Date(), // Token not expired
          },
        },
      })

      if (!user) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid or expired reset token',
        })
      }

      // Hash new password
      const hashedNewPassword = await hashPassword(newPassword)

      // Update password and clear reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedNewPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      })

      return {
        success: true,
        message: 'Password reset successfully',
      }
    }
    else if ('email' in body) {
      // Initiate password reset
      const result = initiateResetSchema.safeParse(body)
      if (!result.success) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid input data',
          data: result.error.issues,
        })
      }

      const { email } = result.data

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email },
      })

      // Always return success message for security (don't reveal if email exists)
      if (!user) {
        return {
          success: true,
          message: 'If an account with this email exists, a password reset link has been sent.',
        }
      }

      // Generate reset token
      const resetToken = generateVerificationToken()
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

      // Save reset token to database
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: resetToken,
          passwordResetExpires: resetExpires,
        },
      })

      // Send reset email
      try {
        await sendPasswordResetEmail(email, resetToken)
      }
      catch (emailError) {
        console.error('Failed to send password reset email:', emailError)
        // Don't throw error to user, but log it
      }

      return {
        success: true,
        message: 'If an account with this email exists, a password reset link has been sent.',
      }
    }
    else {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid request. Either provide email to initiate reset, or token and newPassword to complete reset.',
      })
    }
  }
  catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('Password reset error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error',
    })
  }
})

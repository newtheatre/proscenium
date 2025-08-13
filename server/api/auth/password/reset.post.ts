import { passwordResetInitiateSchema, passwordResetCompleteSchema } from '../../../utils/validation'
import { dbErrors } from '../../../utils/database'
import { successResponse, handleApiError } from '../../../utils/responses'
import { isValidPassword, generateVerificationToken, sendPasswordResetEmail } from '../../../utils/auth'
import prisma from '../../../../lib/prisma'

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
 * @param {string} newPassword - New password (min 8 characters with complexity requirements)
 *
 * Response:
 * {
 *   success: boolean,
 *   message: string
 * }
 *
 * Process:
 * For initiation:
 * 1. Validates email format
 * 2. Finds user by email (returns success regardless for security)
 * 3. Generates reset token and expiry
 * 4. Updates user with reset token using single operation
 * 5. Sends reset email
 *
 * For completion:
 * 1. Validates token and new password
 * 2. Finds user by valid reset token
 * 3. Validates password strength
 * 4. Updates password and clears reset token using batch transaction
 *
 * Error Responses:
 * - 400: Invalid input data or expired/invalid token
 * - 404: User not found (only when completing reset with token)
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    // Check if this is a token-based reset completion or email-based reset initiation
    if ('token' in body && 'newPassword' in body) {
      // Complete password reset with token
      const result = passwordResetCompleteSchema.safeParse(body)
      if (!result.success) {
        throw dbErrors.validation('Invalid input data', result.error.issues)
      }

      const { token, newPassword } = result.data

      // Find user with valid reset token
      const user = await prisma.user.findFirst({
        where: {
          passwordResetToken: token,
          passwordResetExpires: {
            gt: new Date(),
          },
        },
        select: {
          id: true,
          email: true,
        },
      })

      if (!user) {
        throw dbErrors.validation('Invalid or expired reset token')
      }

      // Validate password strength
      const passwordValidation = isValidPassword(newPassword)
      if (!passwordValidation.valid) {
        throw dbErrors.validation(passwordValidation.message!)
      }

      // Hash the new password
      const hashedNewPassword = await hashPassword(newPassword)

      // Update password and clear reset token using batch transaction
      const operations = [
        prisma.user.update({
          where: { id: user.id },
          data: {
            password: hashedNewPassword,
            passwordResetToken: null,
            passwordResetExpires: null,
          },
        }),
      ]

      await prisma.$transaction(operations)

      return successResponse(undefined, 'Password reset successfully')
    }
    else {
      // Initiate password reset with email
      const result = passwordResetInitiateSchema.safeParse(body)
      if (!result.success) {
        throw dbErrors.validation('Invalid input data', result.error.issues)
      }

      const { email } = result.data

      // Check if user exists (don't reveal if user exists for security)
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
      })

      if (user) {
        // Generate reset token
        const resetToken = generateVerificationToken()
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

        // Update user with reset token
        await prisma.user.update({
          where: { id: user.id },
          data: {
            passwordResetToken: resetToken,
            passwordResetExpires: resetExpires,
          },
        })

        // Send reset email (don't fail if email sending fails)
        try {
          await sendPasswordResetEmail(email, resetToken)
        }
        catch (error) {
          console.error('Failed to send password reset email:', error)
          // Continue with success response
        }
      }

      return successResponse(undefined, 'If an account with this email exists, a password reset link will be sent.')
    }
  }
  catch (error: unknown) {
    return handleApiError(error, 'Password reset')
  }
})

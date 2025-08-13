import prisma from '~~/lib/prisma'

/**
 * POST /api/auth/email/resend
 *
 * Resends email verification for unverified users.
 *
 * Request Body:
 * @param {string} email - User's email address
 *
 * Response:
 * {
 *   success: boolean,
 *   message: string
 * }
 *
 * Process:
 * 1. Validates email format
 * 2. Finds user by email (returns success regardless for security)
 * 3. Checks if email is already verified
 * 4. Generates new verification token
 * 5. Updates user with new token using single operation (D1 compatible)
 * 6. Sends verification email
 *
 * Error Responses:
 * - 400: Invalid email format
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    // Validate input
    const result = emailSchema.safeParse(body.email)
    if (!result.success) {
      throw dbErrors.validation('Invalid email format')
    }

    const email = result.data

    // Find user (don't reveal if user exists for security)
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        emailVerified: true,
      },
    })

    if (user && !user.emailVerified) {
      // Generate new verification token
      const verificationToken = generateVerificationToken()
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

      // Update user with new verification token (D1 compatible single operation)
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: verificationToken,
          emailVerificationExpires: verificationExpires,
        },
      })

      // Send verification email (don't fail if email sending fails)
      try {
        await sendVerificationEmail(email, verificationToken)
      }
      catch (error) {
        console.error('Failed to send verification email:', error)
        // Continue with success response
      }
    }

    return successResponse(undefined, 'If an unverified account with this email exists, a verification email will be sent.')
  }
  catch (error: unknown) {
    return handleApiError(error, 'Email verification resend')
  }
})

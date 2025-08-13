import prisma from '~~/lib/prisma'

/**
 * POST /api/auth/email/verify
 *
 * Verifies a user's email address using a verification token.
 *
 * Request Body:
 * @param {string} token - Email verification token
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
 *   },
 *   message: string
 * }
 *
 * Process:
 * 1. Validates token format
 * 2. Finds user with valid, non-expired verification token
 * 3. Updates user as verified and clears token using single operation (D1 compatible)
 * 4. Creates user session
 * 5. Returns verified user data
 *
 * Error Responses:
 * - 400: Invalid token format or expired/invalid verification token
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    // Validate input
    const result = emailVerificationSchema.safeParse(body)
    if (!result.success) {
      throw dbErrors.validation('Invalid token format')
    }

    const { token } = result.data

    // Find user with valid verification token
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: {
          gt: new Date(), // Token not expired
        },
        emailVerified: false, // Not already verified
      },
      select: {
        id: true,
        email: true,
      },
    })

    if (!user) {
      throw dbErrors.validation('Invalid or expired verification token')
    }

    // Update user as verified and clear verification token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    })

    // Get updated user with all relations for session
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: userSelectQuery,
    })

    if (!updatedUser) {
      throw dbErrors.notFound('User')
    }

    // Prepare user data for session (minimal data for cookie size)
    const sessionUser = sessionUserData(updatedUser)

    // Set user session
    await setUserSession(event, {
      user: sessionUser,
      loggedInAt: new Date(),
    })

    return successResponse(
      {
        user: safeUserData(updatedUser),
      },
      'Email verified successfully',
    )
  }
  catch (error: unknown) {
    return handleApiError(error, 'Email verification')
  }
})

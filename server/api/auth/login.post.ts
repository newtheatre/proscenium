import prisma from '~~/lib/prisma'

/**
 * POST /api/auth/login
 *
 * Authenticate a user and create a session.
 *
 * Request Body:
 * @param {string} email - User's email address
 * @param {string} password - User's password
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
 *       profile: {
 *         name: string,
 *         avatar: string | null
 *       } | null,
 *       membership: {
 *         type: MembershipType,
 *         expiry: Date | null
 *       } | null
 *     }
 *   }
 * }
 *
 * Process:
 * 1. Validates input data
 * 2. Finds user by email with all relations
 * 3. Verifies password
 * 4. Checks email verification status
 * 5. Creates user session
 * 6. Returns user data
 *
 * Error Responses:
 * - 400: Invalid input data
 * - 401: Invalid email or password
 * - 403: Email not verified
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    // Validate input
    const result = loginSchema.safeParse(body)
    if (!result.success) {
      throw dbErrors.validation('Invalid input data', result.error.issues)
    }

    const { email, password } = result.data

    // Find user with all relations
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        ...userSelectQuery,
        password: true, // Include password for verification
      },
    })

    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password',
      })
    }

    // Verify password
    const isPasswordValid = await verifyPassword(user.password, password)
    if (!isPasswordValid) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid email or password',
      })
    }

    // Check if email is verified
    if (!user.emailVerified) {
      throw dbErrors.forbidden('Email not verified. Please check your email for a verification link.')
    }

    // Update last login timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    })

    // Prepare user data for session and response
    const sessionUser = sessionUserData(user)

    // Set user session
    await setUserSession(event, {
      user: sessionUser,
      loggedInAt: new Date(),
    })

    return successResponse({
      user: safeUserData(user),
    })
  }
  catch (error: unknown) {
    return handleApiError(error, 'User login')
  }
})

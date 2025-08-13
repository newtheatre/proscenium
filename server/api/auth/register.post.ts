import prisma from '~~/lib/prisma'

/**
 * POST /api/auth/register
 *
 * Register a new user account with email verification.
 *
 * Request Body:
 * @param {string} email - User's email address (must be valid email format)
 * @param {string} password - User's password (min 8 characters, must contain uppercase, lowercase, and number)
 * @param {string} name - User's full name (min 1 character, max 100 characters)
 *
 * Response:
 * {
 *   success: boolean,
 *   message: string
 * }
 *
 * Process:
 * 1. Validates input data
 * 2. Checks if email already exists (returns success message regardless for security)
 * 3. Hashes password
 * 4. Creates user with unverified email status
 * 5. Creates associated profile and membership records using batch transaction
 * 6. Sends verification email
 *
 * Error Responses:
 * - 400: Invalid input data (validation errors)
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    // Validate input
    const result = registerSchema.safeParse(body)
    if (!result.success) {
      throw dbErrors.validation('Invalid input data', result.error.issues)
    }

    const { email, password, name } = result.data

    // Additional email validation
    if (!isValidEmail(email)) {
      throw dbErrors.validation('Invalid email format')
    }

    // Password strength validation
    const passwordValidation = isValidPassword(password)
    if (!passwordValidation.valid) {
      throw dbErrors.validation(passwordValidation.message!)
    }

    // Check if user already exists (don't reveal if user exists for security)
    const userExists = await emailExistsForOtherUser(email)
    if (userExists) {
      return successResponse(undefined, 'If no account with this email exists, a verification email will be sent.')
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Generate email verification token
    const verificationToken = generateVerificationToken()
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Create user and related records using batch transaction
    const operations = [
      prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          emailVerificationToken: verificationToken,
          emailVerificationExpires: verificationExpires,
        },
        select: { id: true },
      }),
    ]

    const results = await prisma.$transaction(operations)
    const user = results[0] as { id: string }

    // Create profile and membership in second batch
    const relatedOps = [
      prisma.profile.create({
        data: {
          userId: user.id,
          name,
          avatar: '',
        },
      }),
      prisma.membership.create({
        data: {
          userId: user.id,
          type: 'UNKNOWN',
          expiry: null,
        },
      }),
    ]

    await prisma.$transaction(relatedOps)

    // Send verification email (don't fail registration if email sending fails)
    try {
      await sendVerificationEmail(email, verificationToken)
    }
    catch (error) {
      console.error('Failed to send verification email:', error)
      // Continue with success response
    }

    return successResponse(undefined, 'If no account with this email exists, a verification email will be sent.')
  }
  catch (error: unknown) {
    return handleApiError(error, 'User registration')
  }
})

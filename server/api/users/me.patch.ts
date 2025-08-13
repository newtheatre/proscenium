import { userSetupSchema, userUpdateSchema } from '~~/server/utils/validation'
import { dbErrors, updateUserWithRelations, emailExistsForOtherUser, studentIdExistsForOtherUser } from '~~/server/utils/database'
import { successResponse, handleApiError, cleanUserData } from '~~/server/utils/responses'
import { generateVerificationToken } from '~~/server/utils/auth'

/**
 * PATCH /api/users/me
 *
 * Updates the current authenticated user's profile and account information.
 *
 * Query Parameters:
 * @param {boolean} setup - If true, performs initial account setup and marks account as setup complete
 *
 * Request Body (setup=true):
 * @param {string} name - User's full name (required for setup)
 * @param {string} [bio] - User's biography (max 500 characters)
 * @param {string} [avatar] - URL to user's avatar image
 * @param {number} [gradYear] - Graduation year (1900-2100)
 * @param {string} [course] - Course/degree name (max 100 characters)
 * @param {MembershipType} membershipType - Membership type (FULL, ASSOCIATE, FELLOW, ALUMNI, GUEST, UNKNOWN)
 * @param {object} [socialLinks] - Social media links
 * @param {string} [socialLinks.github] - GitHub profile URL
 * @param {string} [socialLinks.linkedin] - LinkedIn profile URL
 * @param {string} [socialLinks.facebook] - Facebook profile URL
 * @param {string} [socialLinks.discord] - Discord handle (max 50 characters)
 * @param {string} [socialLinks.instagram] - Instagram handle (max 50 characters)
 * @param {string} [studentId] - Student ID (max 20 characters)
 *
 * Request Body (setup=false or omitted):
 * All fields are optional for regular updates. Same fields as setup but name is optional.
 * @param {string} [name] - User's full name
 * @param {string} [bio] - User's biography (max 500 characters)
 * @param {string} [avatar] - URL to user's avatar image
 * @param {number} [gradYear] - Graduation year (1900-2100)
 * @param {string} [course] - Course/degree name (max 100 characters)
 * @param {MembershipType} [membershipType] - Update membership type
 * @param {object} [socialLinks] - Social media links (same structure as setup)
 * @param {string} [studentId] - Student ID (max 20 characters)
 * @param {string} [email] - New email address (will trigger email re-verification)
 * @param {string} [newPassword] - New password (min 8 characters with complexity requirements) // TODO: require previous password too
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     user: {
 *       id: string,
 *       email: string,
 *       // ... clean user data
 *     }
 *   }
 * }
 *
 * Process:
 * 1. Validates authentication and input data
 * 2. Checks for conflicts (duplicate studentId or email)
 * 3. Uses batch transactions to update user, profile, social links, and membership
 * 4. Handles email change verification if needed
 * 5. Marks setup as complete if setup=true
 *
 * Error Responses:
 * - 401: Unauthorized (user not authenticated)
 * - 400: Invalid input data (validation errors)
 * - 404: User not found or email not verified
 * - 409: Conflict (duplicate studentId or email)
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)
    const body = await readBody(event)
    const isSetup = query.setup === 'true'

    // Validate input
    const result = (isSetup ? userSetupSchema : userUpdateSchema).safeParse(body)
    if (!result.success) {
      throw dbErrors.validation('Invalid input data', result.error.issues)
    }

    const data = result.data

    // Extract fields from validated data
    const {
      socialLinks,
      studentId,
      membershipType,
      ...profileData
    } = data

    // Handle email and password from userUpdateSchema only (not in setup)
    const email = !isSetup && 'email' in data ? data.email : undefined
    const newPassword = !isSetup && 'newPassword' in data ? data.newPassword : undefined

    // Check for conflicts
    if (studentId) {
      const studentIdExists = await studentIdExistsForOtherUser(studentId, user.id)
      if (studentIdExists) {
        throw dbErrors.conflict('Student ID already exists')
      }
    }

    if (email) {
      const emailExists = await emailExistsForOtherUser(email, user.id)
      if (emailExists) {
        throw dbErrors.conflict('Email address already exists')
      }
    }

    // Check setup hasn't been completed yet
    if (isSetup && user.setupCompleted) {
      throw dbErrors.validation('Setup already completed')
    }

    // Prepare update data
    const updates: Parameters<typeof updateUserWithRelations>[1] = {}

    // User level updates
    const userUpdates: NonNullable<Parameters<typeof updateUserWithRelations>[1]['user']> = {}

    if (studentId !== undefined) {
      userUpdates.studentId = studentId
    }

    if (email) {
      userUpdates.email = email
      userUpdates.emailVerified = false
      userUpdates.emailVerificationToken = generateVerificationToken()
      userUpdates.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    }

    if (newPassword) {
      // Hash the new password
      const hashedPassword = await hashPassword(newPassword)
      userUpdates.password = hashedPassword
    }

    if (isSetup) {
      userUpdates.setupCompleted = true
      userUpdates.setupCompletedAt = new Date()

      await setUserSession(event, {
        user: {
          setupCompleted: true,
        },
      })
    }

    if (Object.keys(userUpdates).length > 0) {
      updates.user = userUpdates
    }

    // Profile updates
    if (Object.keys(profileData).length > 0) {
      updates.profile = profileData
    }

    // Social links updates
    if (socialLinks) {
      updates.socialLinks = socialLinks
    }

    // Membership updates
    if (membershipType) {
      updates.membership = {
        type: membershipType,
      }
    }

    // Update user with all relations
    const updatedUser = await updateUserWithRelations(user.id, updates)

    return successResponse({
      user: cleanUserData(updatedUser),
    })
  }
  catch (error: unknown) {
    return handleApiError(error, 'User profile update')
  }
})

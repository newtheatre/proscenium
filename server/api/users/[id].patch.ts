import { adminUserUpdateSchema } from '../../utils/validation'
import { updateUserWithRelations, dbErrors, getUserWithRelations, emailExistsForOtherUser, studentIdExistsForOtherUser } from '../../utils/database'
import { successResponse, handleApiError, safeUserData } from '../../utils/responses'
import { requireRole } from '../../utils/guards'

/**
 * PATCH /api/users/[id]
 *
 * Admin-only endpoint to update any user's information.
 *
 * Path Parameters:
 * @param {string} id - User ID to update
 *
 * Request Body:
 * @param {string} [email] - New email address
 * @param {string} [studentId] - New student ID
 * @param {string} [password] - New password (will be hashed)
 * @param {boolean} [emailVerified] - Email verification status
 * @param {boolean} [setupCompleted] - Setup completion status
 * @param {boolean} [isActive] - User active status
 * @param {RoleType[]} [roles] - User roles array
 * @param {object} [membership] - Membership information
 * @param {MembershipType} membership.type - Membership type
 * @param {DateTime} [membership.expiry] - Membership expiry date
 * @param {object} [profile] - Profile information
 * @param {string} [profile.name] - User's full name
 * @param {string} [profile.bio] - User's biography
 * @param {string} [profile.avatar] - URL to user's avatar image
 * @param {number} [profile.gradYear] - Graduation year
 * @param {string} [profile.course] - Course/degree name
 *
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     user: {
 *       id: string,
 *       email: string,
 *       // ... safe user data
 *     }
 *   },
 *   message: string
 * }
 *
 * Process:
 * 1. Validates admin role and input data
 * 2. Checks for email/studentId uniqueness conflicts
 * 3. Organizes updates by data type (user, profile, membership, roles)
 * 4. Uses batch operations to update all relations
 * 5. Returns updated user data
 *
 * Error Responses:
 * - 400: Invalid input data or missing user ID
 * - 401: Authentication required
 * - 403: Admin role required
 * - 404: User not found
 * - 409: Email or student ID already exists
 * - 500: Internal server error
 */
export default defineEventHandler(async (event) => {
  try {
    // Only admins can update users
    await requireRole(event, 'ADMIN')

    const userId = getRouterParam(event, 'id')
    if (!userId) {
      // Should never happen due to route, but handle gracefully
      throw dbErrors.validation('User ID is required')
    }

    const body = await readBody(event)

    // Validate input
    const result = adminUserUpdateSchema.safeParse(body)
    if (!result.success) {
      throw dbErrors.validation('Invalid input data', result.error.issues)
    }

    const validatedData = result.data

    // Check if user exists
    const existingUser = await getUserWithRelations(userId)

    // Extract fields from validated data
    const {
      roles,
      membership,
      profile,
      ...userData
    } = validatedData

    // Check for email uniqueness if changing email
    if (userData.email && userData.email !== existingUser.email) {
      const emailExists = await emailExistsForOtherUser(userData.email, userId)
      if (emailExists) {
        throw dbErrors.conflict('Email already exists')
      }
    }

    // Check for studentId uniqueness if changing studentId
    if (userData.studentId !== undefined && userData.studentId !== existingUser.studentId) {
      const studentIdExists = await studentIdExistsForOtherUser(userData.studentId, userId)
      if (studentIdExists) {
        throw dbErrors.conflict('Student ID already exists')
      }
    }

    // Prepare update data
    const updates: Parameters<typeof updateUserWithRelations>[1] = {}

    // User level updates
    const userUpdates: NonNullable<Parameters<typeof updateUserWithRelations>[1]['user']> = {}

    if (userData.email) {
      userUpdates.email = userData.email
    }

    if (userData.studentId !== undefined) {
      userUpdates.studentId = userData.studentId
    }

    if (userData.password) {
      const hashedPassword = await hashPassword(userData.password)
      userUpdates.password = hashedPassword
    }

    if (userData.emailVerified !== undefined) {
      userUpdates.emailVerified = userData.emailVerified
    }

    if (userData.setupCompleted !== undefined) {
      userUpdates.setupCompleted = userData.setupCompleted
      if (userData.setupCompleted) {
        userUpdates.setupCompletedAt = new Date()
      }
    }

    if (userData.isActive !== undefined) {
      userUpdates.isActive = userData.isActive
    }

    if (Object.keys(userUpdates).length > 0) {
      updates.user = userUpdates
    }

    // Role updates
    if (roles) {
      updates.roles = roles
    }

    // Membership updates
    if (membership) {
      updates.membership = {
        type: membership.type,
        expiry: membership.expiry ? new Date(membership.expiry) : null,
      }
    }

    // Profile updates
    if (profile) {
      updates.profile = profile
    }

    // Update user with all relations
    const updatedUser = await updateUserWithRelations(userId, updates)

    return successResponse(
      {
        user: safeUserData(updatedUser),
      },
      'User updated successfully',
    )
  }
  catch (error: unknown) {
    return handleApiError(error, 'User update')
  }
})

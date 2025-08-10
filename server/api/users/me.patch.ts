import { z } from 'zod'
import prisma from '~~/lib/prisma'
import { MembershipType } from '@prisma/client'

// Schema for initial account setup
const setupSchema = z.object({
  // Profile information
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  bio: z.string().max(500, 'Bio too long').optional(),
  avatar: z.string().url('Invalid avatar URL').optional(),
  gradYear: z.number().int().min(1900).max(2100).optional(),
  course: z.string().max(100, 'Course name too long').optional(),

  // Membership information
  membershipType: z.nativeEnum(MembershipType),

  // Social links
  socialLinks: z.object({
    github: z.string().url('Invalid GitHub URL').optional(),
    linkedin: z.string().url('Invalid LinkedIn URL').optional(),
    facebook: z.string().url('Invalid Facebook URL').optional(),
    discord: z.string().max(50, 'Discord handle too long').optional(),
    instagram: z.string().max(50, 'Instagram handle too long').optional(),
  }).optional(),

  // Student ID (optional during setup)
  studentId: z.string().max(20, 'Student ID too long').optional(),
})

// Schema for general profile updates
const updateSchema = z.object({
  // Profile information (all optional for updates)
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  bio: z.string().max(500, 'Bio too long').optional(),
  avatar: z.string().url('Invalid avatar URL').optional(),
  gradYear: z.number().int().min(1900).max(2100).optional(),
  course: z.string().max(100, 'Course name too long').optional(),

  // Membership information (can be updated after setup)
  membershipType: z.nativeEnum(MembershipType).optional(),

  // Social links
  socialLinks: z.object({
    github: z.string().url('Invalid GitHub URL').optional(),
    linkedin: z.string().url('Invalid LinkedIn URL').optional(),
    facebook: z.string().url('Invalid Facebook URL').optional(),
    discord: z.string().max(50, 'Discord handle too long').optional(),
    instagram: z.string().max(50, 'Instagram handle too long').optional(),
  }).optional(),

  // Student ID
  studentId: z.string().max(20, 'Student ID too long').optional(),

  // Email (will trigger re-verification)
  email: z.string().email('Invalid email address').optional(),

  // Password change
  newPassword: z.string().min(8).optional(),
})

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
 * @param {MembershipType} [membershipType] - Membership type (FULL, ASSOCIATE, FELLOW, ALUMNI, GUEST, UNKNOWN)
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
 *
 * Response:
 * {
 *   success: boolean,
 *   user: {
 *     id: string,
 *     email: string,
 *     studentId: string | null,
 *     emailVerified: boolean,
 *     setupCompleted: boolean,
 *     setupCompletedAt: DateTime | null,
 *     membership: {
 *       type: MembershipType,
 *       expiry: DateTime | null
 *     } | null,
 *     profile: {
 *       name: string,
 *       bio: string | null,
 *       avatar: string | null,
 *       gradYear: number | null,
 *       course: string | null,
 *       socialLinks: {
 *         github: string | null,
 *         linkedin: string | null,
 *         facebook: string | null,
 *         discord: string | null,
 *         instagram: string | null
 *       } | null
 *     } | null,
 *     createdAt: DateTime,
 *     updatedAt: DateTime,
 *     lastLogin: DateTime | null,
 *     isActive: boolean
 *   }
 * }
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
    const result = (isSetup ? setupSchema : updateSchema).safeParse(body)
    if (!result.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid input data',
        data: result.error.issues,
      })
    }

    const { socialLinks, studentId, ...profileData } = result.data
    const membershipType = ('membershipType' in result.data ? result.data.membershipType : undefined) as MembershipType | undefined
    const email = !isSetup && 'email' in result.data ? result.data.email : undefined

    // Check if studentId is already taken (if provided)
    if (studentId) {
      const existingUser = await prisma.user.findFirst({
        where: {
          studentId,
          NOT: { id: user.id },
        },
      })

      if (existingUser) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Student ID already exists',
        })
      }
    }

    // Check if email is already taken (if provided)
    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email,
          NOT: { id: user.id },
        },
      })

      if (existingUser) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Email address already exists',
        })
      }
    }

    // Start a transaction to update user data
    const updatedUser = await prisma.$transaction(async (tx) => {
      // Update user record
      const userUpdateData: {
        studentId?: string | null
        email?: string
        emailVerified?: boolean
        emailVerificationToken?: string | null
        emailVerificationExpires?: Date | null
        setupCompleted?: boolean
        setupCompletedAt?: Date
      } = {}

      if (studentId !== undefined) {
        userUpdateData.studentId = studentId
      }

      if (email) {
        // Generate new verification token for email change
        const { generateVerificationToken } = await import('../../utils/auth')
        userUpdateData.email = email
        userUpdateData.emailVerified = false
        userUpdateData.emailVerificationToken = generateVerificationToken()
        userUpdateData.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }

      if (isSetup) {
        userUpdateData.setupCompleted = true
        userUpdateData.setupCompletedAt = new Date()
      }

      const userData = await tx.user.update({
        where: { id: user.id, emailVerified: true },
        data: userUpdateData,
        include: {
          profile: {
            include: {
              socialLinks: true,
            },
          },
          membership: true,
        },
      })

      if (!userData) {
        throw createError({
          statusCode: 404,
          statusMessage: 'User not found or email not verified',
        })
      }

      // Update or create profile
      if (Object.keys(profileData).length > 0) {
        if (userData.profile) {
          await tx.profile.update({
            where: { userId: user.id },
            data: profileData,
          })
        }
        else {
          // Ensure name is provided for profile creation during setup
          if (isSetup && !profileData.name) {
            throw createError({
              statusCode: 400,
              statusMessage: 'Name is required for account setup',
            })
          }

          await tx.profile.create({
            data: {
              ...profileData,
              name: profileData.name!,
              userId: user.id,
            },
          })
        }
      }

      // Update or create social links
      if (socialLinks) {
        // Get the profile (either existing or just created)
        const currentProfile = await tx.profile.findUnique({
          where: { userId: user.id },
          include: { socialLinks: true },
        })

        if (currentProfile) {
          if (currentProfile.socialLinks) {
            await tx.socialLinks.update({
              where: { profileId: currentProfile.id },
              data: socialLinks,
            })
          }
          else {
            await tx.socialLinks.create({
              data: {
                ...socialLinks,
                profileId: currentProfile.id,
              },
            })
          }
        }
      }

      // Update or create membership
      if (membershipType) {
        if (userData.membership) {
          await tx.membership.update({
            where: { userId: user.id },
            data: { type: membershipType },
          })
        }
        else {
          await tx.membership.create({
            data: {
              type: membershipType,
              userId: user.id,
            },
          })
        }
      }

      // Return the updated user with all relations
      return await tx.user.findUnique({
        where: { id: user.id },
        include: {
          profile: {
            include: {
              socialLinks: true,
            },
          },
          membership: true,
          roles: true,
        },
      })
    })

    // Return success response
    return {
      success: true,
      user: updatedUser,
    }
  }
  catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('User profile update error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error',
    })
  }
})

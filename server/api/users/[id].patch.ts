import { z } from 'zod'
import prisma from '../../../lib/prisma'
import { requireRole } from '../../utils/guards'
import { MembershipType, RoleType } from '@prisma/client'

// Schema for admin user updates
const adminUpdateUserSchema = z.object({
  // Basic user fields
  email: z.string().email('Invalid email address').optional(),
  studentId: z.string().max(20, 'Student ID too long').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  emailVerified: z.boolean().optional(),
  setupCompleted: z.boolean().optional(),
  isActive: z.boolean().optional(),

  // User roles
  roles: z.array(z.nativeEnum(RoleType)).optional(),

  // Membership information
  membership: z.object({
    type: z.nativeEnum(MembershipType),
    expiry: z.string().datetime().nullable().optional(),
  }).optional(),

  // Profile information
  profile: z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
    bio: z.string().max(500, 'Bio too long').optional(),
    avatar: z.string().url('Invalid avatar URL').or(z.literal('')).optional(),
    gradYear: z.number().int().min(1900).max(2100).optional().nullable(),
    course: z.string().max(100, 'Course name too long').optional(),

    // Social links
    socialLinks: z.object({
      github: z.string().url('Invalid GitHub URL').or(z.literal('')).optional(),
      linkedin: z.string().url('Invalid LinkedIn URL').or(z.literal('')).optional(),
      facebook: z.string().url('Invalid Facebook URL').or(z.literal('')).optional(),
      discord: z.string().max(50, 'Discord handle too long').optional(),
      instagram: z.string().max(50, 'Instagram handle too long').optional(),
    }).optional(),
  }).optional(),
})

export default defineEventHandler(async (event) => {
  // Only admins can update users
  await requireRole(event, 'ADMIN')

  const userId = getRouterParam(event, 'id')
  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required',
    })
  }

  const body = await readBody(event)

  // Validate input using Zod
  const result = adminUpdateUserSchema.safeParse(body)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid input data',
      data: result.error.issues,
    })
  }

  const validatedData = result.data

  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: true,
      membership: true,
      profile: {
        include: {
          socialLinks: true,
        },
      },
    },
  })

  if (!existingUser) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  // Check for email uniqueness if changing email
  if (validatedData.email && validatedData.email !== existingUser.email) {
    const emailExists = await prisma.user.findUnique({
      where: { email: validatedData.email },
    })
    if (emailExists) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Email already exists',
      })
    }
  }

  // Check for studentId uniqueness if changing studentId
  if (validatedData.studentId && validatedData.studentId !== existingUser.studentId) {
    const studentIdExists = await prisma.user.findUnique({
      where: { studentId: validatedData.studentId },
    })
    if (studentIdExists) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Student ID already exists',
      })
    }
  }

  // Hash password if provided
  let hashedPassword: string | undefined
  if (validatedData.password) {
    hashedPassword = await hashPassword(validatedData.password)
  }

  // Prepare user update data
  const userUpdateData: Partial<{
    email: string
    studentId: string | null
    password: string
    emailVerified: boolean
    setupCompleted: boolean
    setupCompletedAt: Date
    isActive: boolean
  }> = {}

  if (validatedData.email !== undefined) userUpdateData.email = validatedData.email
  if (validatedData.studentId !== undefined) userUpdateData.studentId = validatedData.studentId
  if (hashedPassword) userUpdateData.password = hashedPassword
  if (validatedData.emailVerified !== undefined) userUpdateData.emailVerified = validatedData.emailVerified
  if (validatedData.setupCompleted !== undefined) {
    userUpdateData.setupCompleted = validatedData.setupCompleted
    if (validatedData.setupCompleted) {
      userUpdateData.setupCompletedAt = new Date()
    }
  }
  if (validatedData.isActive !== undefined) userUpdateData.isActive = validatedData.isActive

  // Use transaction to update user and related data
  await prisma.$transaction(async (tx) => {
    // Update user basic fields
    await tx.user.update({
      where: { id: userId },
      data: userUpdateData,
    })

    // Update roles if provided
    if (validatedData.roles) {
      // Delete existing roles
      await tx.userRole.deleteMany({
        where: { userId },
      })

      // Create new roles
      if (validatedData.roles.length > 0) {
        await tx.userRole.createMany({
          data: validatedData.roles.map(role => ({
            userId,
            role,
          })),
        })
      }
    }

    // Update membership if provided
    if (validatedData.membership) {
      const membershipData = {
        type: validatedData.membership.type,
        expiry: validatedData.membership.expiry ? new Date(validatedData.membership.expiry) : null,
      }

      if (existingUser.membership) {
        await tx.membership.update({
          where: { userId },
          data: membershipData,
        })
      }
      else {
        await tx.membership.create({
          data: {
            ...membershipData,
            userId,
          },
        })
      }
    }

    // Update profile if provided
    if (validatedData.profile) {
      // Filter out undefined values to avoid Prisma errors
      const profileData: Record<string, string | number | null> = {}
      if (validatedData.profile.name !== undefined) {
        // Name is required in schema, so use empty string instead of null
        profileData.name = validatedData.profile.name || ''
      }
      if (validatedData.profile.bio !== undefined) {
        // Bio is nullable, so empty string becomes null
        profileData.bio = validatedData.profile.bio || null
      }
      if (validatedData.profile.avatar !== undefined) {
        // Avatar is nullable, so empty string becomes null
        profileData.avatar = validatedData.profile.avatar || null
      }
      if (validatedData.profile.gradYear !== undefined) {
        profileData.gradYear = validatedData.profile.gradYear || null
      }
      if (validatedData.profile.course !== undefined) {
        // Course is nullable, so empty string becomes null
        profileData.course = validatedData.profile.course || null
      }

      let profile
      if (existingUser.profile) {
        // Always update profile, even if profileData is empty (to handle clearing fields)
        profile = await tx.profile.update({
          where: { userId },
          data: profileData,
        })
      }
      else {
        // For profile creation, name is required
        if (!validatedData.profile.name) {
          throw createError({
            statusCode: 400,
            statusMessage: 'Profile name is required when creating a new profile',
          })
        }

        profile = await tx.profile.create({
          data: {
            name: validatedData.profile.name,
            bio: validatedData.profile.bio || null,
            avatar: validatedData.profile.avatar || null,
            gradYear: validatedData.profile.gradYear || null,
            course: validatedData.profile.course || null,
            userId,
          },
        })
      }

      // Update social links if provided
      if (validatedData.profile.socialLinks) {
        const socialLinksData = {
          github: validatedData.profile.socialLinks.github || null,
          linkedin: validatedData.profile.socialLinks.linkedin || null,
          facebook: validatedData.profile.socialLinks.facebook || null,
          discord: validatedData.profile.socialLinks.discord || null,
          instagram: validatedData.profile.socialLinks.instagram || null,
        }

        // Check if social links already exist for this profile
        const existingSocialLinks = await tx.socialLinks.findUnique({
          where: { profileId: profile.id },
        })

        if (existingSocialLinks) {
          await tx.socialLinks.update({
            where: { profileId: profile.id },
            data: socialLinksData,
          })
        }
        else {
          await tx.socialLinks.create({
            data: {
              ...socialLinksData,
              profileId: profile.id,
            },
          })
        }
      }
    }
  })

  // Fetch and return the updated user with all relations
  const finalUser = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: true,
      membership: true,
      profile: {
        include: {
          socialLinks: true,
        },
      },
    },
  })

  return {
    user: {
      id: finalUser!.id,
      email: finalUser!.email,
      studentId: finalUser!.studentId,
      emailVerified: finalUser!.emailVerified,
      setupCompleted: finalUser!.setupCompleted,
      setupCompletedAt: finalUser!.setupCompletedAt,
      roles: finalUser!.roles.map((r: { role: RoleType }) => r.role),
      membership: finalUser!.membership,
      profile: finalUser!.profile,
      createdAt: finalUser!.createdAt,
      updatedAt: finalUser!.updatedAt,
      lastLogin: finalUser!.lastLogin,
      isActive: finalUser!.isActive,
    },
  }
})

import prisma from '~~/lib/prisma'
import type { Prisma, MembershipType, RoleType } from '@prisma/client'

/**
 * Standardised user selection for consistent data across endpoints
 */
export const userSelectQuery = {
  id: true,
  email: true,
  studentId: true,
  emailVerified: true,
  setupCompleted: true,
  setupCompletedAt: true,
  createdAt: true,
  updatedAt: true,
  lastLogin: true,
  isActive: true,
  roles: {
    select: {
      role: true,
    },
  },
  profile: {
    select: {
      name: true,
      bio: true,
      avatar: true,
      gradYear: true,
      course: true,
      socialLinks: true,
    },
  },
  membership: {
    select: {
      type: true,
      expiry: true,
    },
  },
} satisfies Prisma.UserSelect

/**
 * Type for user data returned from database with all relations
 */
export type UserWithRelationsRaw = Prisma.UserGetPayload<{
  select: typeof userSelectQuery
}>

/**
 * Create a new user with all required relations using batch transaction
 */
export async function createUserWithRelations(userData: {
  email: string
  password: string
  emailVerificationToken?: string
  emailVerificationExpires?: Date
  profile?: {
    name: string
    bio?: string
    avatar?: string
    gradYear?: number
    course?: string
    socialLinks?: {
      github?: string
      linkedin?: string
      facebook?: string
      discord?: string
      instagram?: string
    }
  }
  membership?: {
    type: MembershipType
    expiry?: Date | null
  }
}): Promise<UserWithRelationsRaw> {
  const operations = []

  // Create user operation
  const userCreate = prisma.user.create({
    data: {
      email: userData.email,
      password: userData.password,
      emailVerificationToken: userData.emailVerificationToken,
      emailVerificationExpires: userData.emailVerificationExpires,
    },
    select: { id: true },
  })
  operations.push(userCreate)

  const results = await prisma.$transaction(operations)
  const user = results[0] as { id: string }

  // Now create related records in a second batch if needed
  const relatedOps = []

  if (userData.profile) {
    relatedOps.push(
      prisma.profile.create({
        data: {
          userId: user.id,
          name: userData.profile.name,
          bio: userData.profile.bio,
          avatar: userData.profile.avatar,
          gradYear: userData.profile.gradYear,
          course: userData.profile.course,
        },
      }),
    )
  }

  if (userData.membership) {
    relatedOps.push(
      prisma.membership.create({
        data: {
          userId: user.id,
          type: userData.membership.type,
          expiry: userData.membership.expiry,
        },
      }),
    )
  }

  if (relatedOps.length > 0) {
    await prisma.$transaction(relatedOps)
  }

  // Handle social links if profile was created
  if (userData.profile?.socialLinks) {
    const profile = await prisma.profile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    })

    if (profile) {
      await prisma.socialLinks.create({
        data: {
          profileId: profile.id,
          ...userData.profile.socialLinks,
        },
      })
    }
  }

  // Return the complete user with relations
  return await getUserWithRelations(user.id)
}

/**
 * Get user with all relations
 */
export async function getUserWithRelations(userId: string): Promise<UserWithRelationsRaw> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: userSelectQuery,
  })

  if (!user) {
    throw dbErrors.notFound('User')
  }

  return user
}

/**
 * Update user with relations using batch transactions
 */
export async function updateUserWithRelations(
  userId: string,
  updates: {
    user?: Partial<{
      email: string
      studentId: string | null
      password: string
      emailVerified: boolean
      emailVerificationToken: string | null
      emailVerificationExpires: Date | null
      setupCompleted: boolean
      setupCompletedAt: Date | null
      isActive: boolean
    }>
    profile?: Partial<{
      name: string
      bio: string | null
      avatar: string | null
      gradYear: number | null
      course: string | null
    }>
    socialLinks?: Partial<{
      github: string | null
      linkedin: string | null
      facebook: string | null
      discord: string | null
      instagram: string | null
    }>
    membership?: {
      type: MembershipType
      expiry?: Date | null
    }
    roles?: RoleType[]
  },
): Promise<UserWithRelationsRaw> {
  const operations = []

  // Update user if needed
  if (updates.user && Object.keys(updates.user).length > 0) {
    operations.push(
      prisma.user.update({
        where: { id: userId },
        data: updates.user,
      }),
    )
  }

  // Update profile if needed
  if (updates.profile && Object.keys(updates.profile).length > 0) {
    // First check if profile exists
    const existingProfile = await prisma.profile.findUnique({
      where: { userId },
      select: { id: true },
    })

    if (existingProfile) {
      operations.push(
        prisma.profile.update({
          where: { userId },
          data: updates.profile,
        }),
      )
    }
    else {
      // Create profile if it doesn't exist
      operations.push(
        prisma.profile.create({
          data: {
            userId,
            name: updates.profile.name || '',
            ...updates.profile,
          },
        }),
      )
    }
  }

  // Execute first batch
  if (operations.length > 0) {
    await prisma.$transaction(operations)
  }

  // Handle social links separately
  if (updates.socialLinks) {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: { id: true, socialLinks: { select: { id: true } } },
    })

    if (profile) {
      if (profile.socialLinks) {
        await prisma.socialLinks.update({
          where: { profileId: profile.id },
          data: updates.socialLinks,
        })
      }
      else {
        await prisma.socialLinks.create({
          data: {
            profileId: profile.id,
            ...updates.socialLinks,
          },
        })
      }
    }
  }

  // Handle membership separately
  if (updates.membership) {
    const existingMembership = await prisma.membership.findUnique({
      where: { userId },
      select: { id: true },
    })

    if (existingMembership) {
      await prisma.membership.update({
        where: { userId },
        data: {
          type: updates.membership.type,
          expiry: updates.membership.expiry,
        },
      })
    }
    else {
      await prisma.membership.create({
        data: {
          userId,
          type: updates.membership.type,
          expiry: updates.membership.expiry,
        },
      })
    }
  }

  // Handle roles separately
  if (updates.roles) {
    const roleOps = [
      prisma.userRole.deleteMany({ where: { userId } }),
      ...(updates.roles.length > 0
        ? [prisma.userRole.createMany({
            data: updates.roles.map(role => ({ userId, role })),
          })]
        : []
      ),
    ]
    await prisma.$transaction(roleOps)
  }

  return await getUserWithRelations(userId)
}

/**
 * Check if email exists for a different user
 */
export async function emailExistsForOtherUser(email: string, excludeUserId?: string): Promise<boolean> {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  })

  return existingUser !== null && existingUser.id !== excludeUserId
}

/**
 * Check if student ID exists for a different user
 */
export async function studentIdExistsForOtherUser(studentId: string, excludeUserId?: string): Promise<boolean> {
  const existingUser = await prisma.user.findUnique({
    where: { studentId },
    select: { id: true },
  })

  return existingUser !== null && existingUser.id !== excludeUserId
}

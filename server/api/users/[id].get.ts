import prisma from '../../../lib/prisma'
import { requireAuth } from '../../utils/guards'
import type { RoleType } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const currentUser = await requireAuth(event)
  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required',
    })
  }

  // Check if user exists
  const targetUser = await prisma.user.findUnique({
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

  if (!targetUser) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  // Check if current user is admin or requesting their own data
  const isAdmin = currentUser.roles.includes('ADMIN')
  const isOwner = currentUser.id === userId

  if (isAdmin) {
    // Admin gets full user information
    return {
      user: {
        id: targetUser.id,
        email: targetUser.email,
        studentId: targetUser.studentId,
        emailVerified: targetUser.emailVerified,
        setupCompleted: targetUser.setupCompleted,
        setupCompletedAt: targetUser.setupCompletedAt,
        roles: targetUser.roles.map((r: { role: RoleType }) => r.role),
        membership: targetUser.membership,
        profile: targetUser.profile,
        createdAt: targetUser.createdAt,
        updatedAt: targetUser.updatedAt,
        lastLogin: targetUser.lastLogin,
        isActive: targetUser.isActive,
      },
    }
  }
  else if (isOwner) {
    // User gets their own full information (but not sensitive admin fields)
    return {
      user: {
        id: targetUser.id,
        email: targetUser.email,
        studentId: targetUser.studentId,
        emailVerified: targetUser.emailVerified,
        setupCompleted: targetUser.setupCompleted,
        setupCompletedAt: targetUser.setupCompletedAt,
        roles: targetUser.roles.map((r: { role: RoleType }) => r.role),
        membership: targetUser.membership,
        profile: targetUser.profile,
        createdAt: targetUser.createdAt,
        updatedAt: targetUser.updatedAt,
        isActive: targetUser.isActive,
      },
    }
  }
  else {
    // Regular users get only public information
    return {
      user: {
        id: targetUser.id,
        profile: targetUser.profile
          ? {
              name: targetUser.profile.name,
              bio: targetUser.profile.bio,
              avatar: targetUser.profile.avatar,
              gradYear: targetUser.profile.gradYear,
              course: targetUser.profile.course,
              socialLinks: targetUser.profile.socialLinks,
            }
          : null,
        membership: targetUser.membership
          ? {
              type: targetUser.membership.type,
            }
          : null,
      },
    }
  }
})

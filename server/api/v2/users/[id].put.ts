import { RoleType, MembershipType } from '@prisma/client'
import z from 'zod'
import prisma from '~~/server/database'

const bodySchema = z.object({
  email: z.email().optional(),
  studentId: z.string().optional(),
  roles: z.array(z.enum(RoleType)).optional(),
  profile: z.object({
    name: z.string(),
    bio: z.string().optional(),
    avatar: z.url().nullable().optional(),
    gradYear: z.number().optional(),
    course: z.string().optional(),
    socialLinks: z.object({
      github: z.string().optional(),
      linkedin: z.string().optional(),
      facebook: z.string().optional(),
      discord: z.string().optional(),
      instagram: z.string().optional(),
    }).optional(),
  }).optional(),
  membership: z.object({
    type: z.enum(MembershipType),
    expiry: z.date(),
  }).optional(),
})

// PUT /api/v2/users/[id]
//
// Update a user by ID. (admin only)
export default defineEventHandler(async (event) => {
  const adminUser = await requireAdmin(event)

  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({
      statusCode: 400,
      message: 'User ID is required',
    })
  }

  const { email, studentId, roles, profile, membership } = await readValidatedBody(event, bodySchema.parse)

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: true,
    },
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'User not found',
    })
  }

  if (email && email !== user.email) {
    const existingUser = await prisma.user.findUnique({
      where: { email: email },
    })

    if (existingUser) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        message: 'A user with that email already exists',
      })
    }
  }

  // Prevent admin from removing their own ADMIN role
  if (userId === adminUser.id && roles && !roles.includes('ADMIN')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Bad Request',
      message: 'You cannot remove your own ADMIN role',
    })
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      email: email ?? undefined,
      studentId: studentId ?? undefined,
      roles: roles
        ? {
            deleteMany: {},
            create: roles.map(role => ({ role })),
          }
        : undefined,
      profile: profile
        ? {
            upsert: {
              create: {
                name: profile.name,
                bio: profile?.bio,
                avatar: profile?.avatar,
                gradYear: profile?.gradYear,
                course: profile?.course,
                socialLinks: profile?.socialLinks ? { create: profile.socialLinks } : undefined,
              },
              update: {
                name: profile.name,
                bio: profile?.bio,
                avatar: profile?.avatar,
                gradYear: profile?.gradYear,
                course: profile?.course,
                socialLinks: profile?.socialLinks ? { upsert: { create: profile.socialLinks, update: profile.socialLinks } } : undefined,
              },
            },
          }
        : undefined,
      membership: membership
        ? {
            upsert: {
              create: {
                type: membership.type,
                expiry: membership.expiry,
              },
              update: {
                type: membership.type,
                expiry: membership.expiry,
              },
            },
          }
        : undefined,
    },
  })

  return {
    message: 'User updated successfully',
  }
})

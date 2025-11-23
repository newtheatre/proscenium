import prisma from '~~/server/database'

// GET /api/v2/users/[id]
//
// Retrieve a user by ID. (admin only)
// TODO: Allow limited access for Managers and Trainers
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({
      statusCode: 400,
      message: 'User ID is required',
    })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: true,
      profile: {
        omit: {
          id: true,
          userId: true,
        },
      },
      membership: {
        omit: {
          id: true,
          userId: true,
        },
      },
    },
    omit: {
      password: true,
      passwordResetToken: true,
      passwordResetExpires: true,
      emailVerificationToken: true,
      emailVerificationExpires: true,
    },
  })

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Not Found',
      message: 'User not found',
    })
  }

  return {
    ...user,
    roles: user.roles.map(r => r.role),
  }
})

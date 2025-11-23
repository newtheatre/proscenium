import prisma from '~~/server/database'

// DELETE /api/v2/users/[id]
//
// Delete a user by ID. (admin only)
export default defineEventHandler(async (event) => {
  const adminUser = await requireAdmin(event)

  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({
      statusCode: 400,
      message: 'User ID is required',
    })
  }

  // Prevent admin from deleting their own account
  if (userId === adminUser.id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot delete your own account. Use /api/account/delete to delete your own account',
    })
  }

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

  if (user.roles.some(r => r.role === 'ADMIN')) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: 'Cannot delete another admin user. Remove their admin role first.',
    })
  }

  await prisma.user.delete({
    where: { id: userId },
  })

  // TODO: Send notification email about account deletion

  return {
    message: 'User deleted successfully',
  }
})

import { db } from '@nuxthub/db'
import { readUser } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  // Get the user with roles using query API
  const user = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
    ...userWithRolesQuery,
  })

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // Check if user has permission to read this user
  await authorize(event, readUser, user)

  return formatUserResponse(user)
})

import { db } from '@nuxthub/db'
import { readUser } from '~~/shared/utils/abilities'

/** GET /api/users/:id. Get a local user mirror by ID. Staff or own profile. */
export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  // Allow-listed: without a column list Drizzle returns the whole row, so a
  // column added later would reach a customer asking about themselves.
  const user = await db.query.users.findFirst({
    columns: { id: true, name: true, email: true },
    where: (users, { eq }) => eq(users.id, userId),
  })

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // Check if user has permission to read this user
  await authorize(event, readUser, user)

  return user
})

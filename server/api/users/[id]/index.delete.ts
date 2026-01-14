import { users } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { deleteUser } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  const userId = getRouterParam(event, 'id')

  if (!userId) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  // Get the user
  const user = await db.select().from(users).where(eq(users.id, userId)).get()

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // Check if user has permission to delete users
  await authorize(event, deleteUser)

  // Prevent users from deleting themselves
  const session = await getUserSession(event)
  if (session.user?.id === userId) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot delete your own account' })
  }

  // Delete user (cascade will delete related records)
  await db.delete(users).where(eq(users.id, userId))

  return { message: 'User deleted successfully' }
})

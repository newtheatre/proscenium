import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { resetUserPassword } from '~~/shared/utils/abilities'
import { TOKEN_EXPIRY } from '~~/server/utils/auth'

/** POST /api/users/:id/reset-password — trigger a password reset for a user. Admin/Manager only. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'User ID is required' })
  }

  // Check if user has permission to reset passwords
  await authorize(event, resetUserPassword, { id })

  // Find the target user
  const user = await db.select().from(schema.users).where(eq(schema.users.id, id)).get()

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // Admin-initiated resets get a longer token lifetime (24 hours)
  const token = await createPasswordResetToken(user.id, TOKEN_EXPIRY.ADMIN_PASSWORD_RESET)
  await sendPasswordResetEmail(user.email, token)

  return { message: 'Password reset email sent' }
})

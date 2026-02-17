import { users, passwordResets } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { generateVerificationToken, sendPasswordResetEmail } from '~~/server/utils/auth'
import { resetUserPassword } from '~~/shared/utils/abilities'

export default defineEventHandler(async (event) => {
  const { id } = getRouterParams(event)

  // Check if user has permission to reset passwords
  await authorize(event, resetUserPassword, { id })

  // Find the target user
  const user = await db.select().from(users).where(eq(users.id, id)).get()

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  // Generate reset token
  const resetToken = generateVerificationToken()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  // Delete any existing password reset tokens for this user
  await db.delete(passwordResets).where(eq(passwordResets.userId, user.id))

  // Create password reset record
  await db.insert(passwordResets).values({
    userId: user.id,
    token: resetToken,
    expiresAt,
  })

  // Send password reset email
  await sendPasswordResetEmail(user.email, resetToken)

  return { message: 'Password reset email sent' }
})

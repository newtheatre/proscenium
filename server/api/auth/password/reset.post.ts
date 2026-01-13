import { users, passwordResets } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

const bodySchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long')
    .refine(val => /[a-z]/.test(val), { message: 'Password must contain at least one lowercase letter' })
    .refine(val => /[A-Z]/.test(val), { message: 'Password must contain at least one uppercase letter' })
    .refine(val => /\d/.test(val), { message: 'Password must contain at least one number' }),
})

export default defineEventHandler(async (event) => {
  const { token, password } = await readValidatedBody(event, bodySchema.parse)

  // Find password reset record
  const resetRecord = await db.select()
    .from(passwordResets)
    .where(eq(passwordResets.token, token))
    .get()

  if (!resetRecord) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid or expired password reset token',
    })
  }

  // Check if token is expired
  if (new Date(resetRecord.expiresAt) < new Date()) {
    // Delete expired token
    await db.delete(passwordResets).where(eq(passwordResets.id, resetRecord.id))

    throw createError({
      statusCode: 400,
      statusMessage: 'Password reset token has expired. Please request a new one.',
    })
  }

  // Hash the new password
  const hashedPassword = await hashPassword(password)

  // Update user password
  await db.update(users)
    .set({ password: hashedPassword })
    .where(eq(users.id, resetRecord.userId))

  // Delete all password reset records for this user
  await db.delete(passwordResets).where(eq(passwordResets.userId, resetRecord.userId))

  return { message: 'Password reset successfully' }
})

import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

const bodySchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema,
})

/** POST /api/auth/password/reset — set a new password using a reset token. */
export default defineEventHandler(async (event) => {
  const { token, password } = await readValidatedBody(event, bodySchema.parse)

  // Find password reset record
  const resetRecord = await db.select()
    .from(schema.passwordResets)
    .where(eq(schema.passwordResets.token, token))
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
    await db.delete(schema.passwordResets).where(eq(schema.passwordResets.id, resetRecord.id))

    throw createError({
      statusCode: 400,
      statusMessage: 'Password reset token has expired. Please request a new one.',
    })
  }

  // Hash the new password
  const hashedPassword = await hashPassword(password)

  // Update user password
  await db.update(schema.users)
    .set({ password: hashedPassword })
    .where(eq(schema.users.id, resetRecord.userId))

  // Delete all password reset records for this user
  await db.delete(schema.passwordResets).where(eq(schema.passwordResets.userId, resetRecord.userId))

  return { message: 'Password reset successfully' }
})

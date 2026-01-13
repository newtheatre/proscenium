import { users, passwordResets } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { generateVerificationToken, sendPasswordResetEmail } from '~~/server/utils/auth'

const bodySchema = z.object({
  email: z.email(),
})

export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, bodySchema.parse)

  const user = await db.select().from(users).where(eq(users.email, email)).get()

  if (!user) {
    // To prevent user enumeration, respond with a success message even if the user doesn't exist
    return { message: 'If the email exists, a password reset link has been sent' }
  }

  // Generate reset token
  const resetToken = generateVerificationToken()
  const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000) // 1 hour

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

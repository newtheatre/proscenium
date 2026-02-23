import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

const bodySchema = z.object({
  email: z.email(),
})

/** POST /api/auth/password/forgot — request a password reset email. */
export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, bodySchema.parse)

  const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get()

  if (!user) {
    // Prevent user enumeration — always return a success message
    return { message: 'If the email exists, a password reset link has been sent' }
  }

  const token = await createPasswordResetToken(user.id)
  await sendPasswordResetEmail(user.email, token)

  return { message: 'Password reset email sent' }
})

import { users } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { createEmailVerificationToken, sendVerificationEmail } from '~~/server/utils/auth'

const bodySchema = z.object({
  email: z.email('Valid email is required'),
})

export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, bodySchema.parse)

  const user = await db.select().from(users).where(eq(users.email, email)).get()

  if (!user) {
    // To prevent user enumeration, respond with a success message even if the user doesn't exist
    return { message: 'If the email exists, a verification link has been sent' }
  }

  // Check if already verified
  if (user.verified) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is already verified',
    })
  }

  // Generate and send new verification token
  const verificationToken = await createEmailVerificationToken(user.id)
  await sendVerificationEmail(email, verificationToken)

  return { message: 'Verification email sent' }
})

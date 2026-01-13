import { users, emailVerifications } from 'hub:db:schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'
import { createEmailVerificationToken, sendVerificationEmail } from '~~/server/utils/auth'

const bodySchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
})

export default defineEventHandler(async (event) => {
  const { token } = await readValidatedBody(event, bodySchema.parse)

  // Find verification record
  const verification = await db.select()
    .from(emailVerifications)
    .where(eq(emailVerifications.token, token))
    .get()

  if (!verification) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid or expired verification token',
    })
  }

  // Check if token is expired
  if (new Date(verification.expiresAt) < new Date()) {
    // Token has expired - generate and send new one
    const user = await db.select().from(users).where(eq(users.id, verification.userId)).get()

    if (user && !user.verified) {
      const newToken = await createEmailVerificationToken(user.id)
      await sendVerificationEmail(user.email, newToken)
    }

    throw createError({
      statusCode: 400,
      statusMessage: 'Verification token has expired. A new one has been sent to your email.',
    })
  }

  // Get user
  const user = await db.select().from(users).where(eq(users.id, verification.userId)).get()

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    })
  }

  if (user.verified) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is already verified',
    })
  }

  // Mark user as verified
  await db.update(users)
    .set({ verified: true })
    .where(eq(users.id, user.id))

  // Delete the verification record
  await db.delete(emailVerifications).where(eq(emailVerifications.id, verification.id))

  // Update session if user is logged in
  const session = await getUserSession(event)
  if (session.user?.id === user.id) {
    await setUserSession(event, {
      user: {
        ...session.user,
        verified: true,
      },
      loggedInAt: session.loggedInAt || new Date(),
    })
  }

  return { message: 'Email verified successfully' }
})

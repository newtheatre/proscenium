import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

const bodySchema = z.object({
  email: z.email('Valid email is required'),
})

/** POST /api/auth/email/request — request a new email verification link. */
export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, bodySchema.parse)

  // Sends an email on every call, so the same inbox-flooding and quota-burning
  // objection applies here as to password reset.
  await assertRateLimit(event, [
    { key: `verify:ip:${clientIp(event)}`, limit: 30, windowSeconds: 60 * 60 },
    { key: `verify:email:${email.toLowerCase()}`, limit: 3, windowSeconds: 60 * 60 },
  ], 'Too many verification emails requested. Please wait an hour, or contact the box office.')

  await sweepRateLimits(event)

  const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get()

  // Respond identically whether or not the address exists, and whether or not
  // it is already verified — otherwise the differing responses let an attacker
  // enumerate which addresses are registered/verified accounts. Only send a new
  // link when there is an unverified account to send it to.
  if (user && !user.verified) {
    const verificationToken = await createEmailVerificationToken(user.id)
    await sendVerificationEmail(email, verificationToken)
  }

  return { message: 'If the email exists and is unverified, a verification link has been sent' }
})

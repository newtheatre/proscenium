import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

const bodySchema = z.object({
  email: z.email(),
})

/**
 * POST /api/auth/password/forgot — request a password reset email.
 *
 * Both branches return this identical response. The two used to differ
 * ('If the email exists…' versus 'Password reset email sent'), which made the
 * endpoint an oracle for whether an address belongs to a customer of the
 * theatre — against 9,957 real addresses, and with no rate limiting yet.
 */
const RESPONSE = { message: 'If that email address has an account, a password reset link has been sent' }

export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, bodySchema.parse)

  // Each call sends an email and rewrites any reset token already in flight, so
  // an unlimited endpoint lets someone flood a victim's inbox, burn the Resend
  // quota, and invalidate the legitimate reset link the victim is trying to use.
  // The address bucket is the one that stops that; the IP bucket only catches
  // the same attack spread across many addresses, and is loose because shared
  // university NAT makes a whole building look like one caller.
  await assertRateLimit(event, [
    { key: `forgot:ip:${clientIp(event)}`, limit: 30, windowSeconds: 60 * 60 },
    { key: `forgot:email:${email.toLowerCase()}`, limit: 3, windowSeconds: 60 * 60 },
  ], 'Too many password reset requests. Please wait an hour, or contact the box office.')

  await sweepRateLimits(event)

  const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get()

  if (!user) return RESPONSE

  // Anonymised accounts belong to the retention-purged legacy import: there is
  // no real person behind the address, and no password to reset.
  if (user.anonymisedAt) return RESPONSE

  const token = await createPasswordResetToken(user.id)
  await sendPasswordResetEmail(user.email, token)

  return RESPONSE
})

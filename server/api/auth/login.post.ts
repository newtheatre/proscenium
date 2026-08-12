import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(1, 'Password is required'),
})

/**
 * POST /api/auth/login — authenticate with email and password.
 *
 * Rate limited on two axes. The per-IP bucket stops one source working through
 * a list of addresses; the per-address bucket stops a distributed attempt
 * working through passwords for one account. Neither alone is enough.
 *
 * The address bucket counts failures only, and is cleared on success, so
 * someone who mistypes their own password three times and then gets it right
 * starts from zero again.
 */
export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, bodySchema.parse)

  const ip = clientIp(event)
  const emailKey = `login:email:${email.toLowerCase()}`

  // The per-IP limit is deliberately loose. Most of this audience is on
  // university wifi behind shared NAT, so an entire hall of residence can look
  // like one address during an on-sale — a tight limit here would lock out real
  // customers long before it inconvenienced an attacker. The per-account
  // failure limit below is the one doing the actual work.
  await assertRateLimit(event, [
    { key: `login:ip:${ip}`, limit: 100, windowSeconds: 15 * 60 },
  ], 'Too many sign-in attempts from this connection. Please wait a few minutes and try again.')

  // Counted before the password check so a failure cannot skip it by throwing.
  const failures = await consumeRateLimit({ key: emailKey, limit: 8, windowSeconds: 15 * 60 })
  if (!failures.ok) {
    setResponseHeader(event, 'retry-after', failures.retryAfter)
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many failed sign-in attempts for this account. Please wait a few minutes, or reset your password.',
    })
  }

  await sweepRateLimits(event)

  // Find user by email
  const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get()

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid email or password',
    })
  }

  // Check if user has a password set
  if (!user.password) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid email or password',
    })
  }

  // Verify password
  const isValidPassword = await verifyPassword(user.password, password)

  if (!isValidPassword) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid email or password',
    })
  }

  // Correct password: forget the failures.
  await resetRateLimit(emailKey)

  // Get user roles
  const roles = await db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, user.id)).all()

  // Update last login
  await db.update(schema.users)
    .set({ lastLogin: new Date().toISOString() })
    .where(eq(schema.users.id, user.id))

  // Set user session
  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      verified: user.verified,
      roles: roles.map(r => r.role),
      sessionEpoch: user.sessionEpoch,
    },
    loggedInAt: new Date(),
  })

  return { message: 'Login successful' }
})

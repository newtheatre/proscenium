import { eq } from 'drizzle-orm'
import { z } from 'zod'

// Never the policy bounds: a password set before the policy tightened must still be able to
// sign in, and telling an attacker the current rules from the sign-in form helps only them.
const body = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(ABSOLUTE_PASSWORD_LIMIT),
})

// Sign in with an address and a password.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, body)
  const email = normaliseEmail(input.email)

  // The one deliberate enumeration exception (A-103 criterion 2). It names a rule about the
  // domain, not about an account, so it tells an attacker nothing they could not read anywhere.
  if (isWorkspaceEmail(email)) {
    throw createError({ statusCode: 403, statusMessage: 'That address signs in with Google' })
  }

  // Counted on what was submitted rather than on what was found: keying this on an account
  // that exists would make being rate limited proof that it does (A-103 criterion 4).
  await enforce(event, {
    scope: 'sign-in',
    value: email,
    limit: CONFIG_KEYS.SIGN_IN_ATTEMPTS_PER_ACCOUNT.default,
    windowMinutes: CONFIG_KEYS.SIGN_IN_ATTEMPTS_PER_ADDRESS_WINDOW_MINUTES.default,
  })

  const account = await findByEmail(email)

  // One message and one shape for every failure: a wrong address, a wrong password, a disabled
  // account and a Google-only account must be indistinguishable from outside.
  const refuse = (): never => {
    throw createError({ statusCode: 401, statusMessage: 'Those details do not match an account' })
  }

  // A verification always runs, even with nothing to verify against, so how long the answer
  // takes cannot tell an attacker whether the address exists (A-103).
  const usable = account && account.password && !account.disabled && account.anonymisedAt === null
  const matches = await verifyPassword(usable ? account.password! : await decoyHash(), input.password)
  if (!usable || !matches) return refuse()

  // A proven password is not a session while a second factor is waiting (A-111 criterion 1).
  if (await confirmedFactor(account.id)) {
    const attemptId = await openAttempt(account.id, CONFIG_KEYS.MFA_ATTEMPT_MINUTES.default)
    await db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: 'mfa.challenged',
      target: `user:${account.id}`,
    }))
    return { ok: true, mfaRequired: true as const, attemptId }
  }

  await db.batch([
    db.update(schema.users).set({ lastLoginAt: Math.floor(Date.now() / 1000) }).where(eq(schema.users.id, account.id)),
    db.insert(schema.auditLog).values(auditEntry({ actorId: account.id, action: 'session.started', target: `user:${account.id}` })),
  ])
  await startSession(event, account)

  return { ok: true, mfaRequired: false as const, user: { id: account.id, name: account.name, email: account.email } }
})

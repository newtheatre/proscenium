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
  const account = await findByEmail(normaliseEmail(input.email))

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

  await db.batch([
    db.update(schema.users).set({ lastLoginAt: Math.floor(Date.now() / 1000) }).where(eq(schema.users.id, account.id)),
    db.insert(schema.auditLog).values(auditEntry({ actorId: account.id, action: 'session.started', target: `user:${account.id}` })),
  ])
  await startSession(event, account)

  return { ok: true, user: { id: account.id, name: account.name, email: account.email } }
})

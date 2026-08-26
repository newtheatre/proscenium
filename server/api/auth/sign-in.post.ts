import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { auditEntry } from '../../../shared/audit'
import { normaliseEmail } from '../../../shared/auth'

const body = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(400),
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

  if (!account || !account.password || account.disabled || account.anonymisedAt !== null) return refuse()
  if (!await verifyPassword(account.password, input.password)) return refuse()

  await db.batch([
    db.update(schema.users).set({ lastLoginAt: Math.floor(Date.now() / 1000) }).where(eq(schema.users.id, account.id)),
    db.insert(schema.auditLog).values(auditEntry({ actorId: account.id, action: 'session.started', target: `user:${account.id}` })),
  ])
  await startSession(event, account)

  return { ok: true, user: { id: account.id, name: account.name, email: account.email } }
})

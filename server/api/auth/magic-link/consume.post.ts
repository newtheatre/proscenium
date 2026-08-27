import { eq } from 'drizzle-orm'
import { z } from 'zod'

const body = z.object({ token: z.string().min(20).max(200) })

// Sign in with a link from a mailbox.
export default defineEventHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, body)

  const claimed = await claimToken(input.token, 'MAGIC_LINK')
  if (!claimed) {
    throw createError({ statusCode: 410, statusMessage: 'That link has expired or has already been used. Ask for a new one.' })
  }

  const account = await findById(claimed.userId)
  if (!account || account.disabled || account.anonymisedAt !== null) {
    throw createError({ statusCode: 410, statusMessage: 'That link is no longer usable' })
  }

  // A link replaces the password step, never the second factor (A-107 criterion 4).
  if (await confirmedFactor(account.id)) {
    const attemptId = await openAttempt(account.id, await configValue(event, 'MFA_ATTEMPT_MINUTES'))
    await db.batch([
      db.update(schema.users).set({ verified: true }).where(eq(schema.users.id, account.id)),
      db.insert(schema.auditLog).values(auditEntry({ actorId: account.id, action: 'mfa.challenged', target: `user:${account.id}` })),
    ])
    return { ok: true, mfaRequired: true as const, attemptId }
  }

  // Consuming the link proves the mailbox, so the address is verified by the act of using it
  // (A-107 criterion 3).
  await db.batch([
    db.update(schema.users).set({ verified: true, lastLoginAt: Math.floor(Date.now() / 1000) }).where(eq(schema.users.id, account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: 'session.started.magic-link',
      target: `user:${account.id}`,
    })),
  ])

  await startSession(event, { ...account, verified: true })
  return { ok: true, mfaRequired: false as const, user: { id: account.id, name: account.name, email: account.email } }
})

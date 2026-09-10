import { eq } from 'drizzle-orm'
import { z } from 'zod'

const body = z.object({
  password: z.string().min(1).max(ABSOLUTE_PASSWORD_LIMIT),
  code: z.string().min(6).max(20).optional(),
})

// Reassert identity with a password and, where the account currently holds one, its second
// factor (A-128 criterion 3).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const input = await readValidatedBodyOrThrow(event, body)

  await enforce(event, {
    scope: 'reauthenticate',
    value: account.id,
    limit: await configValue(event, 'SIGN_IN_ATTEMPTS_PER_ACCOUNT'),
    windowMinutes: await configValue(event, 'SIGN_IN_ATTEMPTS_PER_ADDRESS_WINDOW_MINUTES'),
  })

  if (!account.password || !await verifyPassword(account.password, input.password)) {
    throw createError({ statusCode: 401, statusMessage: 'That password does not match' })
  }

  const needsCode = await confirmedFactor(account.id)
  let factor: 'password' | 'totp' | 'recovery-code' = 'password'

  if (needsCode) {
    if (!input.code) throw createError({ statusCode: 401, statusMessage: 'Enter your authenticator code too' })
    const answer = await answerSecondFactor(account.id, input.code)
    if (!answer.accepted) throw createError({ statusCode: 401, statusMessage: 'That code did not match' })
    factor = answer.factor === 'recovery-code' ? 'recovery-code' : 'totp'

    await db.batch([
      db.update(schema.totpSecrets).set({ lastUsedStep: answer.totpStep }).where(eq(schema.totpSecrets.userId, account.id)),
      db.insert(schema.auditLog).values(auditEntry({
        actorId: account.id,
        action: 'session.reauthenticated',
        target: `user:${account.id}`,
        detail: { factor },
      })),
    ])
  }
  else {
    await db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: 'session.reauthenticated',
      target: `user:${account.id}`,
      detail: { factor },
    }))
  }

  await reassertSession(event, account, factor)
  return { ok: true }
})

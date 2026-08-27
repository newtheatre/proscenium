import { eq } from 'drizzle-orm'

// Remove the authenticator app, and the recovery codes that only existed for it.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await requireFreshSession(event)

  const grants = await liveGrants(account.id)
  if (await requiresSecondFactor(account, grants)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This account holds a role that requires a second factor. Give up the role first.',
    })
  }

  await db.batch([
    db.delete(schema.totpSecrets).where(eq(schema.totpSecrets.userId, account.id)),
    // The codes existed only to recover the factor, so they go with it (A-110 criterion 4).
    db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: 'mfa.removed',
      target: `user:${account.id}`,
    })),
  ])

  return { ok: true }
})

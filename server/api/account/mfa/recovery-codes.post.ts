// Mint a fresh set of recovery codes, retiring the previous one.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await requireFreshSession(event)

  if (!await confirmedFactor(account.id)) {
    throw createError({ statusCode: 409, statusMessage: 'There is no second factor to recover' })
  }

  const codes = await mintRecoveryCodes(account.id)
  await db.insert(schema.auditLog).values(auditEntry({
    actorId: account.id,
    action: 'mfa.recovery-codes.minted',
    target: `user:${account.id}`,
    detail: { count: codes.length },
  }))

  return { ok: true, recoveryCodes: codes }
})

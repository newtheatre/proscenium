// Cancel an address change this account asked for and has not confirmed; its link then moves nothing.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  if (!await pendingEmail(account)) return { ok: true, cancelled: false }

  await db.batch([
    cancelPendingEmailChange(account),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: 'account.email.change.cancelled',
      target: `user:${account.id}`,
    })),
  ])
  return { ok: true, cancelled: true }
})

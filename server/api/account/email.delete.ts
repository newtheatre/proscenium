import { eq, sql } from 'drizzle-orm'

// Cancel an address change this account asked for and has not confirmed; its link then moves nothing.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  if (!await pendingEmail(account)) return { ok: true, cancelled: false }

  // A change the owner did not ask for came from a session they do not hold, so every other one
  // ends with it; otherwise that session simply asks again (0151).
  await db.batch([
    cancelPendingEmailChange(account),
    db.update(schema.users)
      .set({ sessionEpoch: sql`${schema.users.sessionEpoch} + 1` })
      .where(eq(schema.users.id, account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: 'account.email.change.cancelled',
      target: `user:${account.id}`,
      detail: { sessions: 'others' },
    })),
  ])
  await resealSession(event, (await findById(account.id))!)
  return { ok: true, cancelled: true }
})

import { eq, sql } from 'drizzle-orm'

// Remove one way of signing in.
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  await requireFreshSession(event)

  // Nothing static may sit at this depth: a sibling file at a fixed path shadows the parameter
  // and this handler then runs with none, which is why setting a password lives a level up.
  const id = getRouterParam(event, 'id') ?? ''
  await requireRemovable(account, id)

  // Taking a credential away ends every other session holding it (0007).
  const revoke = { sessionEpoch: sql`${schema.users.sessionEpoch} + 1` }
  const kind = id === 'password' ? 'password' : id === 'google' ? 'google' : 'passkey'

  const removal = kind === 'passkey'
    ? db.delete(schema.passkeys).where(eq(schema.passkeys.id, id))
    : db.update(schema.users)
        .set(kind === 'password' ? { password: null, passwordSetAt: null, ...revoke } : { googleSub: null, googleLinkedAt: null, ...revoke })
        .where(eq(schema.users.id, account.id))

  await db.batch([
    removal,
    db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: 'account.method.removed',
      target: `user:${account.id}`,
      detail: { method: kind },
    })),
  ])

  // Told to the address rather than only the screen: a removal nobody asked for has to be
  // noticeable somewhere the person still reads (criterion 4).
  await notify(event, {
    type: 'account.method-removed',
    userId: account.id,
    context: { name: account.name, method: kind, securityUrl: `${useRuntimeConfig(event).public.baseURL}/account/security` },
  })

  // The removal revoked this session too, so it is re-sealed against the new epoch.
  await resealSession(event, (await findById(account.id))!)

  return { ok: true, removed: kind }
})

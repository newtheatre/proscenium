import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

const body = z.object({
  operation: z.enum(['disable', 'enable', 'sign-out', 'reset-mfa', 'erase']),
})

// Immediate security operations on an account, in minutes rather than sessions (A-122).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'accounts.disable')
  const id = getRouterParam(event, 'id') ?? ''
  const input = await readValidatedBodyOrThrow(event, body)

  const account = await findById(id)
  if (!account) throw createError({ statusCode: 404, statusMessage: 'No such account' })

  // Nothing acts on a tombstone: erasure is final, and the rest would be acting on nobody.
  if (account.anonymisedAt !== null) {
    throw createError({ statusCode: 409, statusMessage: 'That account has been erased' })
  }

  // Nobody locks themselves out by accident, and nobody disables the account investigating them
  // (criterion 4).
  if (owns(resolved, id)) {
    throw createError({ statusCode: 409, statusMessage: 'That is your own account' })
  }

  // Admin-initiated erasure mirrors the self-service path exactly, and is audited to whoever
  // did it (criterion 6).
  if (input.operation === 'erase') {
    return { ok: true, operation: input.operation, ...await eraseAccount(id, resolved.account.id) }
  }

  if (input.operation === 'disable' && await wouldStrandTheSystem('ADMIN', id)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'That is the last administrator: grant another before disabling this one',
    })
  }

  // The epoch is what ends every session at once, and it never goes backwards, so re-enabling
  // cannot resurrect a cookie sealed before the disable (criterion 1).
  const revoke = { sessionEpoch: sql`${schema.users.sessionEpoch} + 1` }

  const operations = {
    'disable': { set: { disabled: true, ...revoke }, action: 'account.disabled', detail: changes({ disabled: [false, true] }) },
    'enable': { set: { disabled: false }, action: 'account.enabled', detail: changes({ disabled: [true, false] }) },
    'sign-out': { set: revoke, action: 'session.revoked', detail: { sessions: 'all' } },
    'reset-mfa': { set: revoke, action: 'mfa.reset', detail: { factor: 'cleared', sessions: 'all' } },
  } as const

  const change = operations[input.operation]
  const touch = db.update(schema.users).set(change.set).where(eq(schema.users.id, id))
  const record = db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: change.action,
    target: `user:${id}`,
    detail: change.detail,
  }))

  // A reset takes the factor, the codes and any half-finished challenge with it, in one batch
  // (criterion 3). It does not refuse a privileged role: that is what a reset is for.
  if (input.operation === 'reset-mfa') {
    await db.batch([
      db.delete(schema.totpSecrets).where(eq(schema.totpSecrets.userId, id)),
      db.delete(schema.recoveryCodes).where(eq(schema.recoveryCodes.userId, id)),
      db.delete(schema.mfaAttempts).where(eq(schema.mfaAttempts.userId, id)),
      touch,
      record,
    ])
  }
  else {
    await db.batch([touch, record])
  }

  return { ok: true, operation: input.operation }
})

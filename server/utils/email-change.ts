import { and, eq, gt, isNotNull, ne, sql } from 'drizzle-orm'
import { refusalToChangeEmail } from '#shared/utils/email-change'
import type { AccountRow } from '#server/utils/accounts'
import type { H3Event } from 'h3'

// The one place an address changes. Every path goes through here, so an officer path added later
// invalidates sessions exactly as this one does (A-115 criterion 4).

export interface ChangeOutcome { requested: boolean }

// Asking moves nothing: the old address stays the way in until the new one proves itself (0151).
export async function requestEmailChange(event: H3Event, account: AccountRow, next: string, actorId: string): Promise<ChangeOutcome> {
  const wanted = normaliseEmail(next)

  const refusal = refusalToChangeEmail({ email: account.email, hasPassword: account.password !== null }, wanted)
  if (refusal) throw createError({ statusCode: 400, statusMessage: refusal })

  const base = useRuntimeConfig(event).public.baseURL

  // Enumeration safety: the requester is told nothing, and the address that is already in use
  // hears about it through the mailbox its owner can already read (criterion 2).
  const taken = await findByEmail(wanted)
  if (taken) {
    await notify(event, {
      type: 'account.email.taken',
      userId: taken.id,
      context: { name: '', signInUrl: `${base}/sign-in` },
    })
    return { requested: false }
  }

  // Bound to the address it was issued for, so a link cannot be replayed onto a later one.
  const { plaintext, expiresAt } = await issueToken(account.id, 'EMAIL_VERIFY', undefined, wanted)
  await db.insert(schema.auditLog).values(auditEntry({
    actorId,
    action: 'account.email.change.requested',
    target: `user:${account.id}`,
  }))

  await notifyAddress(event, {
    type: 'account.email.confirm',
    to: wanted,
    context: { name: account.name, url: `${base}/verify?token=${plaintext}`, expiresAt },
  })
  // The owner hears at the address they can still sign in with, before anything has moved.
  await notify(event, {
    type: 'account.email.requested',
    userId: account.id,
    context: { name: '', wanted, cancelUrl: `${base}/account/profile#email`, securityUrl: `${base}/account/security` },
  })
  return { requested: true }
}

// The link from the new address arrived: now the address moves, and every session ends (0151).
export async function completeEmailChange(event: H3Event, account: AccountRow, wanted: string): Promise<void> {
  const taken = await findByEmail(wanted)
  if (taken && taken.id !== account.id) {
    throw createError({ statusCode: 409, statusMessage: 'That address now belongs to another account, so nothing changed' })
  }

  const before = account.email
  await db.batch([
    db.delete(schema.authTokens).where(eq(schema.authTokens.userId, account.id)),
    db.update(schema.users)
      .set({ email: wanted, verified: true, sessionEpoch: sql`${schema.users.sessionEpoch} + 1` })
      .where(eq(schema.users.id, account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: 'account.email.changed',
      target: `user:${account.id}`,
      // The addresses themselves are personal data, so the trail records that it happened (0011).
      detail: { verified: true, sessions: 'all' },
    })),
  ])

  await notifyAddress(event, {
    type: 'account.email.changed',
    to: before,
    context: { name: account.name, wanted, signInUrl: `${useRuntimeConfig(event).public.baseURL}/sign-in` },
  })
}

// The address an account has asked to move to and not yet confirmed, if any.
export async function pendingEmail(account: AccountRow): Promise<string | null> {
  const [row] = await db.select({ email: schema.authTokens.email }).from(schema.authTokens).where(and(
    eq(schema.authTokens.userId, account.id),
    eq(schema.authTokens.kind, 'EMAIL_VERIFY'),
    isNotNull(schema.authTokens.email),
    gt(schema.authTokens.expiresAt, Math.floor(Date.now() / 1000)),
  )).limit(1)
  return row?.email && normaliseEmail(row.email) !== account.email ? row.email : null
}

// A pending change dies with any change to how the account is secured, so an owner who finds one
// they never asked for ends it by doing what the warning says (0151).
export function cancelPendingEmailChange(account: Pick<AccountRow, 'id' | 'email'>) {
  return db.delete(schema.authTokens).where(and(
    eq(schema.authTokens.userId, account.id),
    eq(schema.authTokens.kind, 'EMAIL_VERIFY'),
    isNotNull(schema.authTokens.email),
    ne(schema.authTokens.email, account.email),
  ))
}

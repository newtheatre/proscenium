import { eq, sql } from 'drizzle-orm'
import { refusalToChangeEmail } from '#shared/utils/email-change'
import type { AccountRow } from '#server/utils/accounts'
import type { H3Event } from 'h3'

// The one place an address changes. Every path goes through here, so an officer path added later
// invalidates sessions exactly as this one does (A-115 criterion 4).

export interface ChangeOutcome { changed: boolean }

export async function changeEmail(event: H3Event, account: AccountRow, next: string, actorId: string): Promise<ChangeOutcome> {
  const wanted = normaliseEmail(next)

  const refusal = refusalToChangeEmail({ email: account.email, hasPassword: account.password !== null }, wanted)
  if (refusal) throw createError({ statusCode: 400, statusMessage: refusal })

  // Enumeration safety: the requester is told nothing, and the address that is already in use
  // hears about it through the mailbox its owner can already read (criterion 2).
  const taken = await findByEmail(wanted)
  if (taken) {
    await notify(event, {
      type: 'account.exists',
      userId: taken.id,
      context: { name: '', signInUrl: `${useRuntimeConfig(event).public.baseURL}/sign-in` },
    })
    return { changed: false }
  }

  await db.batch([
    // Unverified again, and every other session ended: the address is how the account is reached,
    // so proving the new one starts over (criterion 1).
    db.update(schema.users)
      .set({ email: wanted, verified: false, sessionEpoch: sql`${schema.users.sessionEpoch} + 1` })
      .where(eq(schema.users.id, account.id)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId,
      action: actorId === account.id ? 'account.email.changed' : 'account.email.changed.admin',
      target: `user:${account.id}`,
      // The addresses themselves are personal data, so the trail records that it happened (0011).
      detail: { verified: false, sessions: 'all' },
    })),
  ])

  // Bound to the address it was issued for, so a link cannot be replayed onto a later one.
  await sendVerification(event, account.id, wanted)
  return { changed: true }
}

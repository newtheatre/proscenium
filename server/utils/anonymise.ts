import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'

/**
 * Replace a person's identifying details while keeping their booking rows.
 *
 * Deletion is not available to anyone with booking history: `reservations.userId`
 * is `onDelete: 'restrict'`, and the sales record has to survive for reporting
 * and for the treasurer's accounts. Anonymisation is the answer instead — the
 * booking stays, the person does not.
 *
 * The result is deliberately indistinguishable in shape from what the legacy
 * import produced for 8,267 retention-expired bookers. The registration/claim
 * guards for these addresses now live in the central auth service, which
 * refuses to register or reset anything on an undeliverable domain.
 *
 * SCOPE (until stage-door Phase 7): this scrubs THIS APP's mirror and
 * reservation data only. The central identity — and any live sessions —
 * survive; full erasure is orchestrated centrally via app hooks in Phase 7,
 * for which this function is the future hook implementation. Until then,
 * pair a local anonymisation with the matching central action in the auth
 * admin (disable / force-logout).
 */

/** Non-routable by definition — `.invalid` is reserved (RFC 2606). */
const ANONYMISED_DOMAIN = 'anonymised.invalid'
const ANONYMISED_NAME = 'Anonymised booker'

function anonymisedEmail(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `closed-${hex}@${ANONYMISED_DOMAIN}`
}

export interface AnonymiseResult {
  alreadyAnonymised: boolean
  reservationsAffected: number
}

/**
 * Anonymise one account and its bookings.
 *
 * Everything goes in a single batch: a half-applied anonymisation would leave
 * the name cleared but the notes intact, or the reverse, with no record of
 * which.
 *
 * Both note fields are cleared. The bulk import only cleared `customerNotes`,
 * which is defensible for a retention sweep, but this path runs because someone
 * has asked to be erased — and a staff note saying who collected the tickets
 * identifies them just as well as the name field did.
 */
export async function anonymiseUser(userId: string): Promise<AnonymiseResult> {
  const user = await db
    .select({ id: schema.users.id, anonymisedAt: schema.users.anonymisedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get()

  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (user.anonymisedAt) return { alreadyAnonymised: true, reservationsAffected: 0 }

  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.reservations)
    .where(eq(schema.reservations.userId, userId))

  const now = sql`(current_timestamp)`

  await db.batch([
    db.update(schema.users)
      .set({
        name: ANONYMISED_NAME,
        email: anonymisedEmail(),
        anonymisedAt: now,
      })
      .where(eq(schema.users.id, userId)),

    db.update(schema.reservations)
      .set({ customerNotes: null, staffNotes: null, anonymisedAt: now })
      .where(eq(schema.reservations.userId, userId)),
  ])

  return { alreadyAnonymised: false, reservationsAffected: Number(n) }
}

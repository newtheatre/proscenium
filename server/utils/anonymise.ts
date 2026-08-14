import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'

/**
 * Replace a person's identifying details while keeping their booking rows
 * (ADR-0014).
 *
 * SCOPE: this app's mirror and reservation data only. It is the implementation
 * behind `POST /api/_hooks/auth/anonymise`, which stage-door calls as part of
 * a centrally orchestrated erasure. Calling it directly leaves the central
 * identity intact and is not on its own a fulfilled erasure request — see
 * docs/04-auth-and-permissions.md §erasure.
 */

/**
 * Non-routable by definition — `.invalid` is reserved (RFC 2606).
 *
 * Byte-identical to what stage-door's `eraseUser` writes, and derived from the
 * user id rather than random bytes so the hook is idempotent. Both properties
 * are load-bearing (ADR-0014).
 */
const ANONYMISED_DOMAIN = 'anonymised.invalid'
const ANONYMISED_NAME = 'Deleted user'

function anonymisedEmail(userId: string): string {
  return `deleted-${userId}@${ANONYMISED_DOMAIN}`
}

export interface AnonymiseResult {
  alreadyAnonymised: boolean
  reservationsAffected: number
}

/**
 * Anonymise one account and its bookings.
 *
 * A single batch: a half-applied anonymisation would clear the name and leave
 * the notes, or the reverse, with no record of which.
 *
 * Both note fields are cleared: a staff note naming who collected the tickets
 * identifies the person as well as the name field did.
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
        email: anonymisedEmail(userId),
        anonymisedAt: now,
      })
      .where(eq(schema.users.id, userId)),

    db.update(schema.reservations)
      .set({ customerNotes: null, staffNotes: null, anonymisedAt: now })
      .where(eq(schema.reservations.userId, userId)),
  ])

  return { alreadyAnonymised: false, reservationsAffected: Number(n) }
}

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
 * The registration/claim guards for these addresses live in the central auth
 * service, which refuses to register or reset anything on an undeliverable
 * domain. Legacy rows from the import use the same `.invalid` domain, so the
 * `notAnonymised` filters match both shapes.
 *
 * SCOPE: this scrubs THIS APP's mirror and reservation data only, and it is
 * the implementation behind `POST /api/_hooks/auth/anonymise`. Since
 * stage-door Phase 7 shipped (2026-08-12) erasure is orchestrated centrally:
 * `eraseUser` rewrites the auth identity, deletes credentials/tokens/roles,
 * bumps `session_epoch`, and then calls this hook on every registered app,
 * retrying until each one succeeds. Central erasure is the supported route —
 * see docs/04-auth-and-permissions.md §erasure. Calling this function directly
 * scrubs the app but leaves the central identity intact, so it is not on its
 * own a fulfilled erasure request.
 */

/**
 * Non-routable by definition — `.invalid` is reserved (RFC 2606).
 *
 * These values are deliberately byte-identical to what stage-door's
 * `eraseUser` writes to the central auth row (stage-door
 * `server/utils/erase.ts`), because the mirror is upserted *from the session*:
 * once the erased identity is re-read from the auth service, `ensureLocalUser`
 * would otherwise overwrite a locally-invented placeholder with the central
 * one, leaving the two stores disagreeing about the same person. Deriving the
 * address from the user id rather than random bytes also makes the hook
 * genuinely idempotent — re-running it produces the same row, which is what
 * stage-door's retry loop assumes.
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

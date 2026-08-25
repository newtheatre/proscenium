import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'

/**
 * Replace identifying details while keeping the booking rows (ADR-0014).
 * This app's share of a stage-door-orchestrated erasure, not a whole one.
 */

/**
 * Byte-identical to what stage-door's eraseUser writes, and derived from the
 * user id so the hook is idempotent. Both are load-bearing (ADR-0014).
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
 * One batch: a half-applied anonymisation would clear the name and leave the
 * notes. Every free text keyed to the subject goes, staff-written too.
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

    // The subject wrote the request note, and a staff note about them names
    // them just as a reservation note does.
    db.update(schema.passRequests)
      .set({ note: null })
      .where(eq(schema.passRequests.userId, userId)),

    db.update(schema.passes)
      .set({ notes: null })
      .where(eq(schema.passes.userId, userId)),

    // `reason` is an enum, so it carries no personal data; `note` is free text.
    db.update(schema.compRequests)
      .set({ note: null })
      .where(eq(schema.compRequests.requestedByUserId, userId)),

    // Deleted outright, not anonymised: special category data held on consent,
    // and consent is what an erasure withdraws (ADR-0022).
    db.delete(schema.accessProfiles).where(eq(schema.accessProfiles.userId, userId)),

    // Also deleted, for a different reason: ADR-0014 keeps rows because sales
    // statistics need them, and practice is not a statistic (ADR-0032).
    db.delete(schema.trainingRuns).where(eq(schema.trainingRuns.userId, userId)),
  ])

  return { alreadyAnonymised: false, reservationsAffected: Number(n) }
}

/**
 * An erasure for somebody this app never mirrored still needs a row, or
 * ensureLocalUser's insert branch recreates them on their next page load.
 */
export async function tombstoneUser(userId: string): Promise<void> {
  await db.insert(schema.users)
    .values({
      id: userId,
      email: anonymisedEmail(userId),
      name: ANONYMISED_NAME,
      anonymisedAt: sql`(current_timestamp)`,
    })
    .onConflictDoNothing()
}

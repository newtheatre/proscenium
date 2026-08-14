import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'

/**
 * Re-point everything this app holds for one auth account onto another —
 * this app's share of an estate-wide account merge (stage-door ADR-0015).
 *
 * SCOPE: like anonymiseUser, this is the implementation behind a hook
 * (`POST /api/_hooks/auth/merge`) and only makes sense as part of the
 * centrally-orchestrated merge: stage-door calls every app's merge hook
 * first, and only when all succeed does it union roles, move credentials,
 * and erase the losing identity. Calling this directly re-points bookings
 * but leaves two live central identities.
 *
 * Four columns reference users — reservations.userId, passes.userId, and
 * the two staff-attribution columns (passes.issuedByUserId,
 * pass_admissions.redeemedByUserId). All four re-point. Each statement
 * binds exactly two parameters however many rows move, so D1's 100-bound-
 * parameter cap is irrelevant here — do not "fix" this into the chunked
 * pattern last-activity uses.
 *
 * The losing mirror row is then deleted: with nothing referencing it the
 * `restrict` FKs are satisfied, and deletion frees its unique email. This
 * does not bend the anonymise-never-delete rule — that rule protects the
 * sales record, which now lives intact on the winner's row. (If a stale
 * session re-upserts the loser's mirror before its epoch bump lands, the
 * resurrected row owns nothing and is harmless.)
 *
 * Idempotent: re-running after a partial failure re-points whatever is
 * left (possibly zero rows) and re-deletes an already-absent row.
 */

export interface MergeCounts {
  reservations: number
  passes: number
  passesIssued: number
  admissionsRedeemed: number
}

export interface MergeResult {
  ok: true
  /** True when the losing account had no mirror row here at all. */
  notMirrored: boolean
  counts: MergeCounts
}

export async function mergeUser(fromUserId: string, toUserId: string, dryRun = false): Promise<MergeResult> {
  const loser = await db.select().from(schema.users)
    .where(eq(schema.users.id, fromUserId)).get()

  const n = (row: { n: number } | undefined) => row?.n ?? 0
  const counts: MergeCounts = {
    reservations: n(await db.select({ n: sql<number>`count(*)` }).from(schema.reservations)
      .where(eq(schema.reservations.userId, fromUserId)).get()),
    passes: n(await db.select({ n: sql<number>`count(*)` }).from(schema.passes)
      .where(eq(schema.passes.userId, fromUserId)).get()),
    passesIssued: n(await db.select({ n: sql<number>`count(*)` }).from(schema.passes)
      .where(eq(schema.passes.issuedByUserId, fromUserId)).get()),
    admissionsRedeemed: n(await db.select({ n: sql<number>`count(*)` }).from(schema.passAdmissions)
      .where(eq(schema.passAdmissions.redeemedByUserId, fromUserId)).get()),
  }

  if (!loser || dryRun) {
    return { ok: true, notMirrored: !loser, counts }
  }

  // The winner needs a mirror row before rows point at it (FK). A minimal
  // one built from the loser's row is fine — ensureLocalUser overwrites it
  // with the canonical identity on the winner's next session.
  const winner = await db.select({ id: schema.users.id }).from(schema.users)
    .where(eq(schema.users.id, toUserId)).get()
  if (!winner) {
    await db.insert(schema.users).values({
      id: toUserId,
      email: `merged-${toUserId}@placeholder.invalid`,
      name: loser.name,
    }).onConflictDoNothing()
  }

  await db.batch([
    db.update(schema.reservations).set({ userId: toUserId })
      .where(eq(schema.reservations.userId, fromUserId)),
    db.update(schema.passes).set({ userId: toUserId })
      .where(eq(schema.passes.userId, fromUserId)),
    db.update(schema.passes).set({ issuedByUserId: toUserId })
      .where(eq(schema.passes.issuedByUserId, fromUserId)),
    db.update(schema.passAdmissions).set({ redeemedByUserId: toUserId })
      .where(eq(schema.passAdmissions.redeemedByUserId, fromUserId)),
    db.delete(schema.users).where(eq(schema.users.id, fromUserId)),
  ])

  return { ok: true, notMirrored: false, counts }
}

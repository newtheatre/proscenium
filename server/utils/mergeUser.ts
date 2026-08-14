import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'

/**
 * Re-point everything this app holds for one auth account onto another — this
 * app's share of an estate-wide account merge (stage-door ADR-0015).
 *
 * SCOPE: the implementation behind `POST /api/_hooks/auth/merge`. Calling it
 * directly re-points bookings but leaves two live central identities.
 *
 * All four user-referencing columns re-point: reservations.userId,
 * passes.userId, passes.issuedByUserId, pass_admissions.redeemedByUserId.
 * Each statement binds two parameters however many rows move, so this is
 * already within D1's limit — do not convert it to the chunked pattern
 * last-activity uses (ADR-0006).
 *
 * Deleting the losing mirror row afterwards does not bend ADR-0014: the sales
 * record lives on intact under the winner.
 *
 * Idempotent: a re-run re-points whatever is left and re-deletes an
 * already-absent row.
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

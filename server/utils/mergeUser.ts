import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'

/**
 * This app's share of an estate-wide account merge (stage-door ADR-0015).
 * All four user-referencing columns re-point. Idempotent.
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

  // The winner needs a mirror row before anything points at it; ensureLocalUser
  // replaces this minimal one on their next session.
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

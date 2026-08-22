import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'

/**
 * This app's share of an estate-wide account merge (stage-door ADR-0015).
 * Every user-referencing column re-points, and CI checks that (ADR-0025).
 */

export interface MergeCounts {
  reservations: number
  passes: number
  passesIssued: number
  admissionsRedeemed: number
  shiftsWorked: number
  shiftsAssigned: number
  incidentEntries: number
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
    shiftsWorked: n(await db.select({ n: sql<number>`count(*)` }).from(schema.performanceShifts)
      .where(eq(schema.performanceShifts.userId, fromUserId)).get()),
    shiftsAssigned: n(await db.select({ n: sql<number>`count(*)` }).from(schema.performanceShifts)
      .where(eq(schema.performanceShifts.assignedByUserId, fromUserId)).get()),
    incidentEntries: n(await db.select({ n: sql<number>`count(*)` }).from(schema.incidentLog)
      .where(eq(schema.incidentLog.authorUserId, fromUserId)).get()),
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
    // Both accounts on the same slot would collide on the one-confirmed-DM
    // index, so the loser's duplicate goes before the rest re-point.
    db.run(sql`
      delete from performance_shifts
      where user_id = ${fromUserId}
        and exists (
          select 1 from performance_shifts winner
          where winner.user_id = ${toUserId}
            and winner.performance_id = performance_shifts.performance_id
            and winner.role = performance_shifts.role
        )
    `),
    db.update(schema.performanceShifts).set({ userId: toUserId })
      .where(eq(schema.performanceShifts.userId, fromUserId)),
    db.update(schema.performanceShifts).set({ assignedByUserId: toUserId })
      .where(eq(schema.performanceShifts.assignedByUserId, fromUserId)),
    // Append-only, so the row is never rewritten; only who it points at is.
    db.update(schema.incidentLog).set({ authorUserId: toUserId })
      .where(eq(schema.incidentLog.authorUserId, fromUserId)),
    db.update(schema.venueEmergencyInfo).set({ updatedByUserId: toUserId })
      .where(eq(schema.venueEmergencyInfo.updatedByUserId, fromUserId)),
    db.update(schema.backstageNights).set({ lastResetByUserId: toUserId })
      .where(eq(schema.backstageNights.lastResetByUserId, fromUserId)),
    db.update(schema.backstageMessages).set({ senderUserId: toUserId })
      .where(eq(schema.backstageMessages.senderUserId, fromUserId)),
    // Append-only, so only who it points at changes, never the row (ADR-0027).
    db.update(schema.ageChecks).set({ checkedByUserId: toUserId })
      .where(eq(schema.ageChecks.checkedByUserId, fromUserId)),
    // At most one profile per account, so the loser's is dropped rather than
    // moved: merging two sets of access needs is not ours to decide.
    db.run(sql`
      delete from access_profiles
      where user_id = ${fromUserId}
        and exists (select 1 from access_profiles winner where winner.user_id = ${toUserId})
    `),
    db.update(schema.accessProfiles).set({ userId: toUserId })
      .where(eq(schema.accessProfiles.userId, fromUserId)),
    db.update(schema.accessProfiles).set({ verifiedByUserId: toUserId })
      .where(eq(schema.accessProfiles.verifiedByUserId, fromUserId)),
    db.update(schema.barPrices).set({ createdByUserId: toUserId })
      .where(eq(schema.barPrices.createdByUserId, fromUserId)),
    db.update(schema.transactions).set({ takenByUserId: toUserId })
      .where(eq(schema.transactions.takenByUserId, fromUserId)),
    db.update(schema.transactions).set({ compApprovedByUserId: toUserId })
      .where(eq(schema.transactions.compApprovedByUserId, fromUserId)),
    db.update(schema.transactions).set({ voidedByUserId: toUserId })
      .where(eq(schema.transactions.voidedByUserId, fromUserId)),
    db.update(schema.barSessions).set({ openedByUserId: toUserId })
      .where(eq(schema.barSessions.openedByUserId, fromUserId)),
    db.update(schema.barSessions).set({ closedByUserId: toUserId })
      .where(eq(schema.barSessions.closedByUserId, fromUserId)),
    db.update(schema.dayReconciliations).set({ enteredByUserId: toUserId })
      .where(eq(schema.dayReconciliations.enteredByUserId, fromUserId)),
    db.update(schema.stockMovements).set({ createdByUserId: toUserId })
      .where(eq(schema.stockMovements.createdByUserId, fromUserId)),
    db.update(schema.stockDeliveries).set({ receivedByUserId: toUserId })
      .where(eq(schema.stockDeliveries.receivedByUserId, fromUserId)),
    db.update(schema.stocktakes).set({ startedByUserId: toUserId })
      .where(eq(schema.stocktakes.startedByUserId, fromUserId)),
    db.update(schema.stocktakes).set({ finishedByUserId: toUserId })
      .where(eq(schema.stocktakes.finishedByUserId, fromUserId)),
    db.update(schema.compRequests).set({ requestedByUserId: toUserId })
      .where(eq(schema.compRequests.requestedByUserId, fromUserId)),
    db.update(schema.compRequests).set({ decidedByUserId: toUserId })
      .where(eq(schema.compRequests.decidedByUserId, fromUserId)),
    db.update(schema.performanceReports).set({ closedByUserId: toUserId })
      .where(eq(schema.performanceReports.closedByUserId, fromUserId)),
    db.update(schema.passRequests).set({ userId: toUserId })
      .where(eq(schema.passRequests.userId, fromUserId)),
    db.update(schema.passRequests).set({ decidedByUserId: toUserId })
      .where(eq(schema.passRequests.decidedByUserId, fromUserId)),
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

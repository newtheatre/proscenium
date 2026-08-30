import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm'
import { daysAfter, londonDay } from '#shared/utils/membership'
import type { H3Event } from 'h3'

// One person, one student number, held on the account rather than repeated on every membership
// (0031). It is how the committee finds somebody against the SU's own record.
export async function recordStudentId(userId: string, studentId: string, actorId: string): Promise<void> {
  const [account] = await db.select({ studentId: schema.users.studentId })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (account?.studentId === studentId) return

  // Unique across accounts, so a number typed against the wrong person is refused rather than
  // quietly moved.
  const [taken] = await db.select({ id: schema.users.id })
    .from(schema.users).where(eq(schema.users.studentId, studentId)).limit(1)
  if (taken && taken.id !== userId) {
    throw createError({ statusCode: 409, statusMessage: 'Another account already holds that student number' })
  }

  await db.batch([
    db.update(schema.users).set({ studentId }).where(eq(schema.users.id, userId)),
    db.insert(schema.auditLog).values(auditEntry({
      actorId,
      action: 'account.student-id.recorded',
      target: `user:${userId}`,
      // The number itself is not in the trail: it identifies a person outside this system (0011).
      detail: { replaced: account?.studentId !== null && account?.studentId !== undefined },
    })),
  ])
}

export interface RenewalSweep { due: number, sent: number, cap: number }

// A cap, because the first sweep after the membership import could otherwise mail a whole year of
// purchases in one night.
const RENEWAL_CAP = 200

// One notice per membership, recorded on the row, so a sweep that missed a night catches up
// rather than sending twice (A-117 criterion 3).
export async function remindExpiringMemberships(event: H3Event | undefined, now = new Date()): Promise<RenewalSweep> {
  const notice = await configValue(event, 'MEMBERSHIP_RENEWAL_NOTICE_DAYS')
  const today = londonDay(now)
  const horizon = daysAfter(today, notice)

  const due = await db.select({
    id: schema.memberships.id,
    userId: schema.memberships.userId,
    expiresOn: schema.memberships.expiresOn,
  })
    .from(schema.memberships)
    .where(and(
      isNull(schema.memberships.renewalNoticeAt),
      lte(schema.memberships.expiresOn, horizon),
      sql`${schema.memberships.expiresOn} >= ${today}`,
    ))
    .orderBy(asc(schema.memberships.expiresOn))
    .limit(RENEWAL_CAP)

  let sent = 0
  for (const membership of due) {
    // Marked before the send, not after: notify records its own outcome, and a message that failed
    // is better than one sent every night until it succeeds.
    await db.update(schema.memberships)
      .set({ renewalNoticeAt: Math.floor(now.getTime() / 1000) })
      .where(eq(schema.memberships.id, membership.id))

    await notify(event, {
      type: 'membership.expiring',
      userId: membership.userId,
      context: { name: '', expiresOn: membership.expiresOn },
    })
    sent++
  }

  return { due: due.length, sent, cap: RENEWAL_CAP }
}

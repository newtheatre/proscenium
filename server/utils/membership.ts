import { db, schema } from '@nuxthub/db'
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { conditionsOf } from '#shared/utils/list-filters'
import { daysAfter, londonDay } from '#shared/utils/membership'
import { membershipsList } from '#shared/utils/memberships-list'
import { tableColumns, whereFrom } from './list-filters'
import type { ListClause, ListQuery } from '#shared/utils/list-filters'
import type { H3Event } from 'h3'
import type { SQL } from 'drizzle-orm'

export const MEMBER_FILTERS = ['current', 'awaiting-check', 'lapsed', 'everyone'] as const

function inTermPredicate(grace: number): SQL {
  const today = londonDay(new Date())
  return sql`${schema.memberships.startsOn} <= ${today}
    and date(${schema.memberships.expiresOn}, ${`+${grace} days`}) >= ${today}`
}

// The register's own four states; "awaiting record" is the claims queue, a different screen and
// a different table, never a predicate here (A-130, K-129).
export function registerFilterPredicate(filter: typeof MEMBER_FILTERS[number], grace: number): SQL | undefined {
  const inTerm = inTermPredicate(grace)
  if (filter === 'current') return inTerm
  if (filter === 'lapsed') return sql`not (${inTerm})`
  if (filter === 'awaiting-check') return and(isNull(schema.memberships.confirmedAt), inTerm)
  return undefined
}

// The register's own declaration, read through one predicate (K-129): current is the hidden
// default, the same shape the accounts directory gives anonymised rows.
export function membershipsClause(query: ListQuery, grace: number): ListClause {
  const clause = whereFrom(membershipsList, query, {
    column: tableColumns(schema.memberships),
    search: [schema.users.name, schema.users.email, sql`coalesce(${schema.users.studentId}, '')`],
    fields: {
      filter: (condition) => {
        const value = condition.values[0]!
        if (!(MEMBER_FILTERS as readonly string[]).includes(value)) {
          throw createError({ statusCode: 400, statusMessage: `${value} is not a register filter; the claims queue answers awaiting-record` })
        }
        return registerFilterPredicate(value as typeof MEMBER_FILTERS[number], grace)
      },
    },
  })
  const asked = conditionsOf(membershipsList, query).some(condition => condition.key === 'filter')
  return asked ? clause : { ...clause, where: and(registerFilterPredicate('current', grace)!, clause.where) }
}

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

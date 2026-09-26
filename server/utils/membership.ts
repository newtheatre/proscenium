import { db, schema } from '@nuxthub/db'
import { and, asc, eq, isNotNull, isNull, like, lte, or, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { conditionsOf } from '#shared/utils/list-filters'
import { daysAfter, londonDay } from '#shared/utils/membership'
import { studentIdConstraintRefusal } from '#shared/utils/membership-claims'
import { membershipsList } from '#shared/utils/memberships-list'
import { configValue, configValueIfSet } from './configuration'
import { tableColumns, whereFrom } from './list-filters'
import { notify } from './notify'
import type { ListQuery } from '#shared/utils/list-filters'
import type { ListClause } from './list-filters'
import type { H3Event } from 'h3'
import type { SQL } from 'drizzle-orm'

export const MEMBER_FILTERS = ['current', 'awaiting-check', 'lapsed', 'everyone'] as const

// Not yet over, grace included: a renewal waiting to start is here as well as the running term.
function notOverPredicate(grace: number): SQL {
  return sql`date(${schema.memberships.expiresOn}, ${`+${grace} days`}) >= ${londonDay(new Date())}`
}

function inTermPredicate(grace: number): SQL {
  return sql`${schema.memberships.startsOn} <= ${londonDay(new Date())} and ${notOverPredicate(grace)}`
}

// The register's own four states; "awaiting record" is the claims queue, a different screen and
// a different table, never a predicate here (A-130, K-129).
export function registerFilterPredicate(filter: typeof MEMBER_FILTERS[number], grace: number): SQL | undefined {
  if (filter === 'current') return inTermPredicate(grace)
  if (filter === 'lapsed') return sql`not (${notOverPredicate(grace)})`
  if (filter === 'awaiting-check') return and(isNull(schema.memberships.confirmedAt), notOverPredicate(grace))
  return undefined
}

// A term with a later one after it has been renewed, so it is not "running out" (A-130).
export function notRenewed(): SQL {
  return sql`not exists (select 1 from memberships later
    where later.user_id = ${schema.memberships.userId} and later.expires_on > ${schema.memberships.expiresOn})`
}

// An erased account's term is statistics, not somebody on the register: no view of it or its
// export shows one, and the listing counts what it left out (A-121 criterion 4, 0071).
const notErased = (): SQL => isNull(schema.users.anonymisedAt)

export interface MembershipsClause extends ListClause {
  // The same filter and search, over the erased rows the register leaves out.
  hiddenErased: SQL
}

// The register's own declaration, read through one predicate (K-129): current is the hidden
// default, the same shape the accounts directory gives anonymised rows.
export function membershipsClause(query: ListQuery, grace: number): MembershipsClause {
  const clause = whereFrom(membershipsList, query, {
    column: tableColumns(schema.memberships),
    search: [schema.users.name, schema.users.email, sql`coalesce(${schema.users.studentId}, '')`],
    fields: {
      filter: (condition) => {
        const value = condition.values[0]!
        if (!(MEMBER_FILTERS as readonly string[]).includes(value)) {
          throw createError({ statusCode: 400, statusMessage: 'That filter is not one the membership register offers' })
        }
        return registerFilterPredicate(value as typeof MEMBER_FILTERS[number], grace)
      },
    },
  })
  const asked = conditionsOf(membershipsList, query).some(condition => condition.key === 'filter')
  const where = asked ? clause.where : and(registerFilterPredicate('current', grace)!, clause.where)
  return { ...clause, where: and(notErased(), where), hiddenErased: and(isNotNull(schema.users.anonymisedAt), where)! }
}

// The CSV export's own predicate, without paging, sorting or search in the URL (A-117 criterion 5).
export function registerExportWhere(filter: typeof MEMBER_FILTERS[number], search: string | undefined, grace: number): SQL {
  const terms: SQL[] = [notErased()]
  const filterTerm = registerFilterPredicate(filter, grace)
  if (filterTerm) terms.push(filterTerm)
  if (search) {
    const wanted = `%${search.toLowerCase()}%`
    terms.push(or(
      like(sql`lower(${schema.users.name})`, wanted),
      like(sql`lower(${schema.users.email})`, wanted),
      like(sql`lower(coalesce(${schema.users.studentId}, ''))`, wanted),
    )!)
  }
  return and(...terms)!
}

// Either membership route's statements as one batch. A number another account holds fails it on
// the `users_student_id` index, so nothing is written and the refusal says why (0047).
export async function batchMembershipWrites(statements: SQL[]): Promise<void> {
  const runs = statements.map(statement => db.run(statement))
  try {
    await db.batch([runs[0]!, ...runs.slice(1)])
  }
  catch (error) {
    const refusal = studentIdConstraintRefusal(error)
    if (refusal) throw createError(refusal)
    throw error
  }
}

export interface RenewalSweep { due: number, sent: number, cap: number }

// A cap, because the first sweep after the membership import could otherwise mail a whole year of
// purchases in one night.
const RENEWAL_CAP = 200

// One notice per membership, recorded on the row, so a sweep that missed a night catches up
// rather than sending twice (A-117 criterion 3).
export async function remindExpiringMemberships(event: H3Event | undefined, now = new Date()): Promise<RenewalSweep> {
  const notice = await configValue(event, 'MEMBERSHIP_RENEWAL_NOTICE_DAYS')
  const purchaseUrl = await configValueIfSet(event, 'MEMBERSHIP_PURCHASE_URL')
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
      notRenewed(),
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
      context: { name: '', expiresOn: membership.expiresOn, purchaseUrl },
    })
    sent++
  }

  return { due: due.length, sent, cap: RENEWAL_CAP }
}

import { db, schema } from '@nuxthub/db'
import { and, count, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING, 0055).
import { tableColumns, whereFrom } from './list-filters'
import { accountsList } from '#shared/utils/accounts-list'
import { conditionsOf } from '#shared/utils/list-filters'
import { londonDay } from '#shared/utils/membership'
import type { ListClause } from './list-filters'
import type { FilterCondition, ListQuery } from '#shared/utils/list-filters'
import type { SQL } from 'drizzle-orm'

// The account directory's predicates (A-121), answered from its declaration (K-129). A role and a
// membership are questions about other rows, read at query time and never a flag (0009, 0031).

const live = (now: number): SQL => or(
  isNull(schema.roleGrants.expiresAt),
  gt(schema.roleGrants.expiresAt, now),
)!

// Exported for the retention sweep (K-111): a live role, any role, is a role-holder exemption.
export const holdsLiveRole = (now: number, role?: string): SQL => sql`exists (
  select 1 from ${schema.roleGrants}
  where ${schema.roleGrants.userId} = ${schema.users.id}
    and ${role ? sql`${schema.roleGrants.role} = ${role}` : sql`1 = 1`}
    and ${live(now)}
)`

const holdsAnyLiveRole = (now: number, roles: string[]): SQL => sql`exists (
  select 1 from ${schema.roleGrants}
  where ${schema.roleGrants.userId} = ${schema.users.id}
    and ${inArray(schema.roleGrants.role, roles)}
    and ${live(now)}
)`

const hasConfirmedFactor = (): SQL => sql`exists (
  select 1 from ${schema.totpSecrets}
  where ${schema.totpSecrets.userId} = ${schema.users.id}
    and ${schema.totpSecrets.confirmedAt} is not null
)`

// Password-holding, privileged, and no factor: exactly what requiresSecondFactor decides per
// account, expressed once over the whole table rather than a query each (A-112 criterion 5).
export function privilegedWithoutFactor(privileged: string[], now: number): SQL {
  if (privileged.length === 0) return sql`1 = 0`
  return and(
    isNotNull(schema.users.password),
    holdsAnyLiveRole(now, privileged),
    sql`not ${hasConfirmedFactor()}`,
  )!
}

// Inactive for long enough that the retention sweep would warn, were it built (K-111). Computed
// from the last sign-in, falling back to when the account was made.
export function insideRetentionWindow(years: number, now: number): SQL {
  const cutoff = now - Math.round(years * 365.25 * 24 * 60 * 60)
  return sql`coalesce(${schema.users.lastLoginAt}, ${schema.users.createdAt}) < ${cutoff}`
}

// Current means today is inside the term or its grace window, read at query time (0009, 0031).
// Exported for the retention sweep too (K-111): an active member is exempt.
export function currentMembership(grace: number): SQL {
  return sql`exists (select 1 from ${schema.memberships}
    where ${schema.memberships.userId} = ${schema.users.id}
      and ${schema.memberships.startsOn} <= ${londonDay(new Date())}
      and date(${schema.memberships.expiresOn}, ${`+${grace} days`}) >= ${londonDay(new Date())})`
}

const everHeldMembership = (): SQL =>
  sql`exists (select 1 from ${schema.memberships} where ${schema.memberships.userId} = ${schema.users.id})`

const neverSignedIn = (): SQL => and(
  isNull(schema.users.password),
  isNull(schema.users.googleSub),
  isNull(schema.users.lastLoginAt),
)!

// What the declaration's derived fields need, resolved by the endpoint from configuration so
// this file stays free of Nitro and a test can drive it with plain values.
export interface AccountsContext {
  now: number
  graceDays: number
  privilegedRoles: string[]
  retentionYears: number
}

export interface AccountsQuery extends ListQuery {
  // The picker's flag: a tombstone is a valid target for some things, so it may ask for them.
  includeAnonymised?: boolean
}

const yes = (condition: FilterCondition): boolean => condition.values[0] === 'true'
const either = (condition: FilterCondition, when: SQL): SQL => (yes(condition) ? when : sql`not (${when})`)

function roleCondition(condition: FilterCondition, now: number): SQL {
  const [role] = condition.values
  switch (condition.operator) {
    case 'is': return holdsLiveRole(now, role)
    case 'not': return sql`not ${holdsLiveRole(now, role)}`
    case 'any': return holdsAnyLiveRole(now, condition.values)
    default: return sql`not ${holdsLiveRole(now)}`
  }
}

function membershipCondition(condition: FilterCondition, grace: number): SQL {
  switch (condition.values[0]) {
    case 'current': return currentMembership(grace)
    case 'lapsed': return and(everHeldMembership(), sql`not ${currentMembership(grace)}`)!
    default: return sql`not ${everHeldMembership()}`
  }
}

export function accountsClause(query: AccountsQuery, context: AccountsContext): ListClause {
  const clause = whereFrom(accountsList, query, {
    column: tableColumns(schema.users),
    search: [schema.users.name, schema.users.email, sql`coalesce(${schema.users.studentId}, '')`],
    fields: {
      role: condition => roleCondition(condition, context.now),
      holdsRole: condition => either(condition, holdsLiveRole(context.now)),
      membership: condition => membershipCondition(condition, context.graceDays),
      anonymised: condition => (yes(condition) ? isNotNull(schema.users.anonymisedAt) : isNull(schema.users.anonymisedAt)),
      authenticator: condition => either(condition, hasConfirmedFactor()),
      privilegedWithoutFactor: condition => either(condition, privilegedWithoutFactor(context.privilegedRoles, context.now)),
      approachingRetention: condition => either(condition, insideRetentionWindow(context.retentionYears, context.now)),
      neverSignedIn: condition => either(condition, neverSignedIn()),
    },
  })

  // Anonymised rows are hidden unless explicitly asked for (A-121 criterion 4).
  const asked = query.includeAnonymised || conditionsOf(accountsList, query).some(condition => condition.key === 'anonymised')
  return asked ? clause : { ...clause, where: and(isNull(schema.users.anonymisedAt), clause.where) }
}

export async function directoryTotal(where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ total: count() }).from(schema.users).where(where)
  return row?.total ?? 0
}

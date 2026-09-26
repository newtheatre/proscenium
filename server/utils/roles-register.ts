import { db, schema } from '@nuxthub/db'
import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING, 0055).
import { isShadow } from './directory'
import { tableColumns, whereFrom, yesNo } from './list-filters'
import { conditionsOf } from '#shared/utils/list-filters'
import { PROTECTED_ROLE } from '#shared/utils/roles'
import { rolesList } from '#shared/utils/roles-list'
import type { ListClause, Reference } from './list-filters'
import type { ListQuery } from '#shared/utils/list-filters'
import type { SQL } from 'drizzle-orm'

// The role register's predicates and its counts (A-131). A grant belongs to an account, so every
// statement here reads role_grants joined to users and never one without the other.

const live = (now: number): SQL => or(
  isNull(schema.roleGrants.expiresAt),
  gt(schema.roleGrants.expiresAt, now),
)!

const lapsed = (now: number): SQL => lte(schema.roleGrants.expiresAt, now)

// A tombstone holds no office: "usable" excludes the anonymised the same way the last-admin
// guard does (A-120 criterion 3). Erasure scrubs the note and leaves the row (0011).
const heldByAnAccount = (): SQL => sql`${schema.users.anonymisedAt} is null`

// Nobody can use it yet: A-116's claim, or a first sign-in, is what makes it held (A-132, 0088).
const pendingHolder = (): SQL => and(isShadow(), isNull(schema.users.lastLoginAt))!

const held = (): SQL => and(heldByAnAccount(), sql`not (${pendingHolder()})`)!

// Pending grants are listed apart from the holders, live or lapsed alike (A-132 criterion 3).
export function pendingClause(): SQL {
  return and(heldByAnAccount(), pendingHolder())!
}

// Permanent grants across every role (A-131 criterion 6); a pending one is listed apart (A-132).
export function permanentClause(): SQL {
  return and(isNull(schema.roleGrants.expiresAt), held())!
}

// An account that could use a grant today: enabled, not erased and not waiting for its first
// sign-in (A-120 criterion 3, 0088).
export function usableAccountWhere(): SQL {
  return and(eq(schema.users.disabled, false), held())!
}

// Usable for the last-IT-Manager guard: live, on a usable account.
export function usableHolderWhere(role: string, now: number): SQL {
  return and(
    eq(schema.roleGrants.role, role),
    live(now),
    usableAccountWhere(),
  )!
}

// Every usable IT Manager with their expiry, which is all the guard weighs (issue #1355).
export function protectedHoldersStatement(now: number): SQL {
  return sql`select ${schema.roleGrants.userId} as userId, ${schema.roleGrants.expiresAt} as expiresAt
    from ${schema.roleGrants}
    join ${schema.users} on ${schema.users.id} = ${schema.roleGrants.userId}
    where ${usableHolderWhere(PROTECTED_ROLE, now)}`
}

export interface RolesQuery extends ListQuery {
  // Asks for lapsed grants without filtering to them, the way includeShadow does (0071).
  includeLapsed?: boolean
}

export interface RolesClause extends ListClause {
  // Counts what the default hiding took out; undefined whenever nothing was hidden.
  hiddenLapsed: SQL | undefined
}

// The holder's name sorts and searches from users; everything else is a column on the grant.
function columnOf(name: string): Reference | undefined {
  const onTheGrant = tableColumns(schema.roleGrants)(name)
  if (onTheGrant) return onTheGrant
  return tableColumns(schema.users)(name)
}

export function grantsClause(query: RolesQuery, now: number): RolesClause {
  const clause = whereFrom(rolesList, query, {
    column: columnOf,
    search: [schema.users.name, schema.users.email],
    fields: {
      lapsed: yesNo(lapsed(now)),
      permanent: yesNo(isNull(schema.roleGrants.expiresAt)),
    },
  })

  const conditions = conditionsOf(rolesList, query)
  const asked = Boolean(query.includeLapsed) || conditions.some(condition => condition.key === 'lapsed')

  return {
    ...clause,
    where: and(held(), asked ? undefined : live(now), clause.where),
    hiddenLapsed: asked ? undefined : and(held(), lapsed(now), clause.where),
  }
}

// One grouped statement for every role at once: a count per role would bind a parameter per row
// of a table it walks, which scales the way an `IN` list does (0006).
export function holderCountsStatement(now: number): SQL {
  return sql`select ${schema.roleGrants.role} as role, count(*) as holders
    from ${schema.roleGrants}
    join ${schema.users} on ${schema.users.id} = ${schema.roleGrants.userId}
    where ${held()} and ${live(now)}
    group by ${schema.roleGrants.role}`
}

export async function holderCounts(now: number): Promise<Record<string, number>> {
  const counted = await db.all<{ role: string, holders: number }>(holderCountsStatement(now))
  return Object.fromEntries(counted.map(row => [row.role, Number(row.holders)]))
}

export async function registerTotal(where: SQL | undefined): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`select count(*) as total
    from ${schema.roleGrants}
    join ${schema.users} on ${schema.users.id} = ${schema.roleGrants.userId}
    where ${where ?? sql`1 = 1`}`)
  return Number(row?.total ?? 0)
}

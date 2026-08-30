import { londonDay } from '#shared/utils/membership'
import { and, count, eq, gt, inArray, isNotNull, isNull, like, ne, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'

// The questions the unified system actually raises about an account (A-121 criterion 1). Two of
// them cannot be answered yet, and say so rather than returning an empty list that looks broken.
export const DIRECTORY_FILTERS = [
  'everyone',
  'members-current',
  'members-lapsed',
  'guests-unclaimed',
  'role-holders',
  'privileged-without-mfa',
  'unverified',
  'disabled',
  'anonymised',
  'retention-window',
] as const

export type DirectoryFilter = (typeof DIRECTORY_FILTERS)[number]

// A filter whose data has no writer yet. It runs and returns nothing, which is the truth.
export const AWAITING: Partial<Record<DirectoryFilter, string>> = {
  'members-current': 'A-117',
  'members-lapsed': 'A-117',
  'guests-unclaimed': 'A-116',
}

const live = (now: number): SQL => or(
  isNull(schema.roleGrants.expiresAt),
  gt(schema.roleGrants.expiresAt, now),
)!

const holdsLiveRole = (now: number, role?: string): SQL => sql`exists (
  select 1 from ${schema.roleGrants}
  where ${schema.roleGrants.userId} = ${schema.users.id}
    and ${role ? sql`${schema.roleGrants.role} = ${role}` : sql`1 = 1`}
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
    sql`exists (
      select 1 from ${schema.roleGrants}
      where ${schema.roleGrants.userId} = ${schema.users.id}
        and ${inArray(schema.roleGrants.role, privileged)}
        and ${live(now)}
    )`,
    sql`not ${hasConfirmedFactor()}`,
  )!
}

// Inactive for long enough that the retention sweep would warn, were it built (K-111). Computed
// from the last sign-in, falling back to when the account was made.
export function insideRetentionWindow(years: number, now: number): SQL {
  const cutoff = now - Math.round(years * 365.25 * 24 * 60 * 60)
  return sql`coalesce(${schema.users.lastLoginAt}, ${schema.users.createdAt}) < ${cutoff}`
}

export interface DirectoryQuery {
  filter: DirectoryFilter
  role?: string
  search?: string
  includeAnonymised: boolean
}

const graceDays = (event: H3Event): Promise<number> => configValue(event, 'MEMBERSHIP_GRACE_DAYS')

// Current means today is inside the term or its grace window, read at query time so a membership
// that ran out overnight stops counting without a sweep having to run (0009, 0031).
function currentMembership(grace: number): SQL {
  return sql`exists (select 1 from ${schema.memberships}
    where ${schema.memberships.userId} = ${schema.users.id}
      and ${schema.memberships.startsOn} <= ${londonDay(new Date())}
      and date(${schema.memberships.expiresOn}, ${`+${grace} days`}) >= ${londonDay(new Date())})`
}

export async function directoryPredicate(event: H3Event, query: DirectoryQuery): Promise<SQL> {
  const now = Math.floor(Date.now() / 1000)
  const parts: SQL[] = []

  // Anonymised rows are hidden unless explicitly asked for (criterion 4).
  if (!query.includeAnonymised && query.filter !== 'anonymised') {
    parts.push(isNull(schema.users.anonymisedAt))
  }

  switch (query.filter) {
    case 'members-current':
      parts.push(currentMembership(await graceDays(event)))
      break
    case 'members-lapsed':
      parts.push(sql`exists (select 1 from ${schema.memberships} where ${schema.memberships.userId} = ${schema.users.id})`)
      parts.push(sql`not ${currentMembership(await graceDays(event))}`)
      break
    case 'guests-unclaimed':
      parts.push(isNull(schema.users.password), isNull(schema.users.googleSub), isNull(schema.users.lastLoginAt))
      break
    case 'role-holders':
      parts.push(holdsLiveRole(now, query.role))
      break
    case 'privileged-without-mfa':
      parts.push(privilegedWithoutFactor(await configValue(event, 'PRIVILEGED_ROLES'), now))
      break
    case 'unverified':
      parts.push(eq(schema.users.verified, false))
      break
    case 'disabled':
      parts.push(eq(schema.users.disabled, true))
      break
    case 'anonymised':
      parts.push(isNotNull(schema.users.anonymisedAt))
      break
    case 'retention-window':
      parts.push(insideRetentionWindow(await configValue(event, 'RETENTION_FULL_ACCOUNT_YEARS'), now))
      break
    case 'everyone':
      break
  }

  if (query.search) {
    const term = `%${query.search.toLowerCase()}%`
    parts.push(or(like(sql`lower(${schema.users.name})`, term), like(schema.users.email, term))!)
  }

  return parts.length > 0 ? and(...parts)! : ne(schema.users.id, '')
}

export async function directoryTotal(where: SQL): Promise<number> {
  const [row] = await db.select({ total: count() }).from(schema.users).where(where)
  return row?.total ?? 0
}

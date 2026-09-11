import { sql } from 'drizzle-orm'
import { accountsList } from '#shared/utils/accounts-list'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { envelope, offsetFor } from '#shared/utils/pagination'
import { accountsClause, directoryTotal, insideRetentionWindow, privilegedWithoutFactor } from '#server/utils/directory'
import type { AccountsContext } from '#server/utils/directory'

// The picker's flag rides beside the declared fields: a tombstone is a valid target for some
// things (A-121 criterion 4).
const query = filterQuerySchema(accountsList).extend({
  includeAnonymised: yesOrNo.default(false),
})

// The account directory: search, filter and triage (A-121), through its declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'accounts.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const context: AccountsContext = {
    now: Math.floor(Date.now() / 1000),
    graceDays: await configValue(event, 'MEMBERSHIP_GRACE_DAYS'),
    privilegedRoles: await configValue(event, 'PRIVILEGED_ROLES'),
    retentionYears: await configValue(event, 'RETENTION_FULL_ACCOUNT_YEARS'),
  }
  const { where, orderBy } = accountsClause(input, context)
  const total = await directoryTotal(where)

  // An explicit column list: without one the ORM returns the password hash and the Google
  // subject alongside everything else.
  const items = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    verified: schema.users.verified,
    disabled: schema.users.disabled,
    anonymisedAt: schema.users.anonymisedAt,
    lastLoginAt: schema.users.lastLoginAt,
    createdAt: schema.users.createdAt,
    hasPassword: sql<boolean>`${schema.users.password} is not null`,
    hasGoogle: sql<boolean>`${schema.users.googleSub} is not null`,
    hasFactor: sql<boolean>`exists (select 1 from ${schema.totpSecrets}
      where ${schema.totpSecrets.userId} = ${schema.users.id} and ${schema.totpSecrets.confirmedAt} is not null)`,
  })
    .from(schema.users)
    .where(where)
    .orderBy(...orderBy)
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  return {
    ...envelope(items, total, input.page, input.pageSize),
    banners: await banners(context),
  }
})

// Both counts in one statement: D1 caps compound selects low, and a query per banner per page
// load is two round trips where one will do (0006).
async function banners(context: AccountsContext): Promise<{ privilegedWithoutFactor: number, insideRetentionWindow: number }> {
  const [row] = await db.select({
    privilegedWithoutFactor: sql<number>`sum(case when ${privilegedWithoutFactor(context.privilegedRoles, context.now)} then 1 else 0 end)`,
    insideRetentionWindow: sql<number>`sum(case when ${insideRetentionWindow(context.retentionYears, context.now)} then 1 else 0 end)`,
  })
    .from(schema.users)
    .where(sql`${schema.users.anonymisedAt} is null`)

  return {
    privilegedWithoutFactor: Number(row?.privilegedWithoutFactor ?? 0),
    insideRetentionWindow: Number(row?.insideRetentionWindow ?? 0),
  }
}

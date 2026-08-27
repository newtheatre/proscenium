import { asc, sql } from 'drizzle-orm'
import { z } from 'zod'
import { ROLES } from '#shared/utils/roles'
import { envelope, offsetFor, pageQuery } from '#shared/utils/pagination'
import { AWAITING, DIRECTORY_FILTERS, directoryPredicate, directoryTotal, insideRetentionWindow, privilegedWithoutFactor } from '#server/utils/directory'
import type { H3Event } from 'h3'

const query = pageQuery.extend({
  filter: z.enum(DIRECTORY_FILTERS).default('everyone'),
  role: z.enum(ROLES).optional(),
  search: z.string().trim().max(200).optional(),
  includeAnonymised: z.coerce.boolean().default(false),
})

// The account directory: search, filter and triage (A-121).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'accounts.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const where = await directoryPredicate(event, input)
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
    .orderBy(asc(schema.users.name))
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  return {
    ...envelope(items, total, input.page, input.pageSize),
    awaiting: AWAITING[input.filter] ?? null,
    banners: await banners(event),
  }
})

// Both counts in one statement: D1 caps compound selects low, and a query per banner per page
// load is two round trips where one will do (0006).
async function banners(event: H3Event): Promise<{ privilegedWithoutFactor: number, insideRetentionWindow: number }> {
  const now = Math.floor(Date.now() / 1000)
  const privileged = await configValue(event, 'PRIVILEGED_ROLES')
  const years = await configValue(event, 'RETENTION_FULL_ACCOUNT_YEARS')

  const [row] = await db.select({
    privilegedWithoutFactor: sql<number>`sum(case when ${privilegedWithoutFactor(privileged, now)} then 1 else 0 end)`,
    insideRetentionWindow: sql<number>`sum(case when ${insideRetentionWindow(years, now)} then 1 else 0 end)`,
  })
    .from(schema.users)
    .where(sql`${schema.users.anonymisedAt} is null`)

  return {
    privilegedWithoutFactor: Number(row?.privilegedWithoutFactor ?? 0),
    insideRetentionWindow: Number(row?.insideRetentionWindow ?? 0),
  }
}

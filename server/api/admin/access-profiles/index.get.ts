import { db, schema } from '@nuxthub/db'
import { eq, sql } from 'drizzle-orm'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { accessProfilesList } from '#shared/utils/access-profiles-list'
import { accessProfilesClause } from '#server/utils/access-profiles'

const query = filterQuerySchema(accessProfilesList)

// Every access profile declaration, without the encrypted payload: the accessibility officer
// opens one to read it (D-127 criterion 2), filtered and ordered by its own declaration (K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'access.verify')
  const input = await getValidatedQueryOrThrow(event, query)
  const { where, orderBy } = accessProfilesClause(input)

  const [total] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.accessProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.accessProfiles.userId))
    .where(where)

  // A light summary only: the officer opens one declaration to read its flags and notes, so the
  // list never carries the encrypted payload at all.
  const items = await db.select({
    userId: schema.accessProfiles.userId,
    name: schema.users.name,
    email: schema.users.email,
    status: schema.accessProfiles.status,
    companions: schema.accessProfiles.companions,
    createdAt: schema.accessProfiles.createdAt,
    updatedAt: schema.accessProfiles.updatedAt,
  })
    .from(schema.accessProfiles)
    .innerJoin(schema.users, eq(schema.users.id, schema.accessProfiles.userId))
    .where(where)
    .orderBy(...orderBy)
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  return envelope(items, Number(total?.count ?? 0), input.page, input.pageSize)
})

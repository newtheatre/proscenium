import { eq, sql } from 'drizzle-orm'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { membershipsList } from '#shared/utils/memberships-list'
import { envelope, offsetFor } from '#shared/utils/pagination'
import { membershipsClause } from '#server/utils/membership'
import type { SQL } from 'drizzle-orm'

const query = filterQuerySchema(membershipsList)

// The membership register, which is what an SU return is taken from (A-117 criterion 5, K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'members.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const grace = await configValue(event, 'MEMBERSHIP_GRACE_DAYS')

  const { where, orderBy, hiddenErased } = membershipsClause(input, grace)

  const count = async (predicate: SQL): Promise<number> => {
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(predicate)
    return Number(row?.count ?? 0)
  }

  // An explicit column list: a register is not a reason to hand over everything on an account.
  const items = await db.select({
    id: schema.memberships.id,
    userId: schema.memberships.userId,
    name: schema.users.name,
    email: schema.users.email,
    studentId: schema.users.studentId,
    startsOn: schema.memberships.startsOn,
    expiresOn: schema.memberships.expiresOn,
    source: schema.memberships.source,
    confirmedAt: schema.memberships.confirmedAt,
  })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(where)
    .orderBy(...orderBy)
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  // The window travels with the listing so the screen can say why somebody still counts, rather
  // than keeping a second copy of the setting; the erased count says hidden never means lost (0071).
  return {
    ...envelope(items, await count(where!), input.page, input.pageSize),
    graceDays: grace,
    erasedHidden: await count(hiddenErased),
  }
})

import { and, eq, like, or, sql } from 'drizzle-orm'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { membershipsList } from '#shared/utils/memberships-list'
import { envelope, offsetFor } from '#shared/utils/pagination'
import { MEMBER_FILTERS, membershipsClause, registerFilterPredicate } from '#server/utils/membership'
import type { SQL } from 'drizzle-orm'

export { MEMBER_FILTERS }

// Kept for the CSV export, which answers the same four states without paging, sorting or search
// living in the URL (A-117 criterion 5).
export function registerPredicate(filter: typeof MEMBER_FILTERS[number], search: string | undefined, grace: number): SQL | undefined {
  const terms: SQL[] = []
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
  return terms.length ? and(...terms) : undefined
}

const query = filterQuerySchema(membershipsList)

// The membership register, which is what an SU return is taken from (A-117 criterion 5, K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'members.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const grace = await configValue(event, 'MEMBERSHIP_GRACE_DAYS')

  const { where, orderBy } = membershipsClause(input, grace)

  const [total] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(where)

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
  // than keeping a second copy of the setting.
  return { ...envelope(items, Number(total?.count ?? 0), input.page, input.pageSize), graceDays: grace }
})

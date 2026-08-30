import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { envelope, offsetFor, pageQuery } from '#shared/utils/pagination'
import { londonDay } from '#shared/utils/membership'
import type { SQL } from 'drizzle-orm'

export const MEMBER_FILTERS = ['current', 'awaiting-check', 'lapsed', 'everyone'] as const

const query = pageQuery.extend({
  filter: z.enum(MEMBER_FILTERS).default('current'),
  search: z.string().trim().max(200).optional(),
})

// The membership register, which is what an SU return is taken from (A-117 criterion 5).
export function registerPredicate(filter: typeof MEMBER_FILTERS[number], search: string | undefined, grace: number): SQL | undefined {
  const today = londonDay(new Date())
  const inTerm = sql`${schema.memberships.startsOn} <= ${today}
    and date(${schema.memberships.expiresOn}, ${`+${grace} days`}) >= ${today}`

  const terms: SQL[] = []
  if (filter === 'current') terms.push(inTerm)
  if (filter === 'lapsed') terms.push(sql`not (${inTerm})`)
  if (filter === 'awaiting-check') terms.push(isNull(schema.memberships.confirmedAt), inTerm)
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

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'members.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const grace = await configValue(event, 'MEMBERSHIP_GRACE_DAYS')
  const where = registerPredicate(input.filter, input.search, grace)

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
    .orderBy(desc(schema.memberships.expiresOn))
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  // The window travels with the listing so the screen can say why somebody still counts, rather
  // than keeping a second copy of the setting.
  return { ...envelope(items, Number(total?.count ?? 0), input.page, input.pageSize), graceDays: grace }
})

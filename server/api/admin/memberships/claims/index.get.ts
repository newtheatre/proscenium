import { and, asc, eq, isNull, like, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { CLAIM_STATUSES } from '#shared/utils/membership-claims'
import { envelope, offsetFor, pageQuery } from '#shared/utils/pagination'

const query = pageQuery.extend({
  status: z.enum(CLAIM_STATUSES).default('OPEN'),
  search: z.string().trim().max(200).optional(),
})

// The claims queue, oldest first, paged in SQL for the week after cutover when it holds
// hundreds (A-130 criterion 2). An erased person's claim is nobody's to answer.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'members.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const terms = [eq(schema.membershipClaims.status, input.status), isNull(schema.users.anonymisedAt)]
  if (input.search) {
    const wanted = `%${input.search.toLowerCase()}%`
    terms.push(or(
      like(sql`lower(${schema.users.name})`, wanted),
      like(sql`lower(${schema.users.email})`, wanted),
      like(sql`lower(${schema.membershipClaims.studentId})`, wanted),
    )!)
  }
  const where = and(...terms)

  const [total] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.membershipClaims)
    .innerJoin(schema.users, eq(schema.users.id, schema.membershipClaims.userId))
    .where(where)

  // An explicit column list: the queue shows what the officer needs to check and nothing else.
  const items = await db.select({
    id: schema.membershipClaims.id,
    userId: schema.membershipClaims.userId,
    name: schema.users.name,
    email: schema.users.email,
    studentId: schema.membershipClaims.studentId,
    // What the account holds already, so a mismatch is visible before it is written over.
    heldStudentId: schema.users.studentId,
    startsOn: schema.membershipClaims.startsOn,
    term: schema.membershipClaims.term,
    status: schema.membershipClaims.status,
    createdAt: schema.membershipClaims.createdAt,
  })
    .from(schema.membershipClaims)
    .innerJoin(schema.users, eq(schema.users.id, schema.membershipClaims.userId))
    .where(where)
    .orderBy(asc(schema.membershipClaims.createdAt), asc(schema.membershipClaims.id))
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  return envelope(items, Number(total?.count ?? 0), input.page, input.pageSize)
})

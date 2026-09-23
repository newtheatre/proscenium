import { eq, sql } from 'drizzle-orm'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { claimAgainstHeld } from '#shared/utils/membership'
import { membershipClaimsList } from '#shared/utils/membership-claims-list'
import { envelope, offsetFor } from '#shared/utils/pagination'
import type { Term } from '#shared/utils/membership'

const query = filterQuerySchema(membershipClaimsList)

// The claims queue, oldest first, paged in SQL for the week after cutover when it holds
// hundreds, and the decided claims behind it (A-130 criteria 2 and 10, K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'members.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const { where, orderBy } = claimsClause(input)

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
    // What an officer wrote back to the member, shown beside a decided claim.
    reason: schema.membershipClaims.reason,
    decidedAt: schema.membershipClaims.decidedAt,
    createdAt: schema.membershipClaims.createdAt,
    // The account's terms, read per claim by subquery, so the queue says what recording will do.
    terms: sql<string>`(select json_group_array(json_object('startsOn', starts_on, 'expiresOn', expires_on))
      from memberships where user_id = ${schema.membershipClaims.userId})`,
  })
    .from(schema.membershipClaims)
    .innerJoin(schema.users, eq(schema.users.id, schema.membershipClaims.userId))
    .where(where)
    .orderBy(...orderBy)
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  // The route's own rule (claimAgainstHeld): what a recording would extend, and a purchase that
  // "Record one" already wrote, which is declined as such rather than recorded twice.
  const read = items.map(({ terms, ...claim }) => {
    const held = claimAgainstHeld(JSON.parse(terms) as Term[], claim.startsOn)
    return { ...claim, heldUntil: held.heldUntil, heldSameDay: held.sameDay }
  })
  return envelope(read, Number(total?.count ?? 0), input.page, input.pageSize)
})

import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { CLAIM_STATUSES } from '#shared/utils/membership-claims'
import { membershipClaimsList } from '#shared/utils/membership-claims-list'
import { envelope, offsetFor } from '#shared/utils/pagination'
import { tableColumns, whereFrom } from '#server/utils/list-filters'
import type { Reference } from '#server/utils/list-filters'

// Status stays fixed at OPEN: nothing on the screen offers to see a decided claim, so it rides
// beside the declared fields rather than joining them (K-129).
const query = filterQuerySchema(membershipClaimsList).extend({
  status: z.enum(CLAIM_STATUSES).default('OPEN'),
})

// `id` is not a guide to insertion order; `rowid` is, and is not a Drizzle column (0006).
function claimsColumn(name: string): Reference | undefined {
  if (name === 'rowid') return sql`${schema.membershipClaims}.rowid`
  return tableColumns(schema.membershipClaims)(name)
}

// The claims queue, oldest first, paged in SQL for the week after cutover when it holds
// hundreds (A-130 criterion 2, K-129). An erased person's claim is nobody's to answer.
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'members.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const clause = whereFrom(membershipClaimsList, input, {
    column: claimsColumn,
    search: [schema.users.name, schema.users.email, schema.membershipClaims.studentId],
  })
  const where = and(eq(schema.membershipClaims.status, input.status), isNull(schema.users.anonymisedAt), clause.where)

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
    // The latest term already on the account: a claim for something "Record one" already wrote
    // is declined as such rather than recorded twice.
    heldUntil: sql<string | null>`(select max(expires_on) from memberships where user_id = ${schema.membershipClaims.userId})`,
  })
    .from(schema.membershipClaims)
    .innerJoin(schema.users, eq(schema.users.id, schema.membershipClaims.userId))
    .where(where)
    .orderBy(...clause.orderBy)
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  return envelope(items, Number(total?.count ?? 0), input.page, input.pageSize)
})

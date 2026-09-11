import { eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { auditList } from '#shared/utils/audit-list'
import { filterQuerySchema } from '#shared/utils/list-filters'
import { envelope, offsetFor } from '#shared/utils/pagination'
import { auditClause } from '#server/utils/audit-search'

const query = filterQuerySchema(auditList)

// Search the audit trail (J-103, K-129).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'audit.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const { where, orderBy } = auditClause(input)

  // The actor's name is joined rather than stored: an erased actor reads as its tombstone, which
  // is the whole point of anonymising rather than deleting (0011).
  const subject = alias(schema.users, 'subject')

  const items = await db.select({
    id: schema.auditLog.id,
    actorId: schema.auditLog.actorId,
    actorName: schema.users.name,
    action: schema.auditLog.action,
    target: schema.auditLog.target,
    // An entry names its subject by id; the screen should not (0032). Joined on the id inside the
    // `user:` prefix, so an entry about something else still shows what it says.
    targetName: subject.name,
    detail: schema.auditLog.detail,
    createdAt: schema.auditLog.createdAt,
  })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorId))
    .leftJoin(subject, eq(sql`'user:' || ${subject.id}`, schema.auditLog.target))
    .where(where)
    .orderBy(...orderBy)
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  const [total] = await db.select({ count: sql<number>`count(*)` }).from(schema.auditLog).where(where)

  return envelope(items, Number(total?.count ?? 0), input.page, input.pageSize)
})

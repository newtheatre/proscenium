import { desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { z } from 'zod'
import { AUDIT_ACTION_NAMES, AUDIT_MODULES } from '#shared/utils/audit-actions'
import type { AuditActionName } from '#shared/utils/audit-actions'
import { envelope, offsetFor, pageQuery } from '#shared/utils/pagination'
import { auditPredicate, auditTotal } from '#server/utils/audit-search'

const query = pageQuery.extend({
  actor: z.string().max(64).optional(),
  action: z.enum(AUDIT_ACTION_NAMES as [AuditActionName, ...AuditActionName[]]).optional(),
  module: z.enum(AUDIT_MODULES).optional(),
  target: z.string().max(200).optional(),
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
})

// Search the audit trail (J-103).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'audit.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const where = auditPredicate(input)
  const total = await auditTotal(where)

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
    .orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id))
    .limit(input.pageSize)
    .offset(offsetFor(input.page, input.pageSize))

  return envelope(items, total, input.page, input.pageSize)
})

import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { AUDIT_ACTION_NAMES, AUDIT_MODULES } from '#shared/utils/audit-actions'
import { formatLondon } from '#shared/utils/london'
import type { AuditActionName } from '#shared/utils/audit-actions'
import { auditPredicate } from '#server/utils/audit-search'

// A technical bound rather than a policy one, so it is a constant and not a setting (0012).
const EXPORT_LIMIT = 5000

const query = z.object({
  actor: z.string().max(64).optional(),
  action: z.enum(AUDIT_ACTION_NAMES as [AuditActionName, ...AuditActionName[]]).optional(),
  module: z.enum(AUDIT_MODULES).optional(),
  target: z.string().max(200).optional(),
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
})

const COLUMNS = ['id', 'occurred', 'actorId', 'actor', 'action', 'target', 'detail'] as const

// Quoted always: a detail column holds JSON, and deciding per value is how a comma ends up
// splitting a row.
function cell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

// Export the current filter as CSV (J-103 criterion 5). The name of the file is in the
// disposition header: an extension in the path would be a route segment, not a format.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'audit.read')
  const input = await getValidatedQueryOrThrow(event, query)

  const rows = await db.select({
    id: schema.auditLog.id,
    actorId: schema.auditLog.actorId,
    actorName: schema.users.name,
    action: schema.auditLog.action,
    target: schema.auditLog.target,
    detail: schema.auditLog.detail,
    createdAt: schema.auditLog.createdAt,
  })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorId))
    .where(auditPredicate(input))
    .orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id))
    .limit(EXPORT_LIMIT)

  // Taking a copy of the trail is itself an act on it, so it lands in the trail (criterion 5).
  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'audit.exported',
    target: null,
    detail: { ...input, rows: rows.length, capped: rows.length === EXPORT_LIMIT },
  }))

  const lines = [COLUMNS.join(',')]
  for (const row of rows) {
    lines.push([
      cell(row.id),
      cell(formatLondon(new Date(row.createdAt * 1000))),
      cell(row.actorId ?? 'system'),
      cell(row.actorId === null ? 'system' : row.actorName),
      cell(row.action),
      cell(row.target),
      cell(row.detail === null ? '' : JSON.stringify(row.detail)),
    ].join(','))
  }

  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', 'attachment; filename="audit-trail.csv"')
  return lines.join('\n')
})

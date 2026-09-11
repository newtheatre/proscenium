import { desc, eq } from 'drizzle-orm'
import { auditList } from '#shared/utils/audit-list'
import { conditionsOf, filterQuerySchema } from '#shared/utils/list-filters'
import { formatLondon } from '#shared/utils/london'
import { auditClause } from '#server/utils/audit-search'
import type { ListQuery } from '#shared/utils/list-filters'

// A technical bound rather than a policy one, so it is a constant and not a setting (0012).
const EXPORT_LIMIT = 5000

const query = filterQuerySchema(auditList)

const COLUMNS = ['id', 'occurred', 'actorId', 'actor', 'action', 'target', 'detail'] as const

// Quoted always: a detail column holds JSON, and deciding per value is how a comma ends up
// splitting a row.
function cell(value: unknown): string {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

// What was asked for, in words rather than as encoded conditions: read back on the entry this
// export writes for itself (criterion 5).
function askedFor(input: ListQuery): Record<string, unknown> {
  const asked: Record<string, unknown> = {}
  for (const condition of conditionsOf(auditList, input)) {
    asked[condition.key] = condition.values.length === 1 ? condition.values[0] : condition.values
  }
  if (input.search) asked.target = input.search
  return asked
}

// Export the current filter as CSV (J-103 criterion 5, K-129). The name of the file is in the
// disposition header: an extension in the path would be a route segment, not a format.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'audit.read')
  const input = await getValidatedQueryOrThrow(event, query)
  const { where } = auditClause(input)

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
    .where(where)
    .orderBy(desc(schema.auditLog.createdAt), desc(schema.auditLog.id))
    .limit(EXPORT_LIMIT)

  // Taking a copy of the trail is itself an act on it, so it lands in the trail (criterion 5).
  await db.insert(schema.auditLog).values(auditEntry({
    actorId: resolved.account.id,
    action: 'audit.exported',
    target: null,
    detail: { ...askedFor(input), rows: rows.length, capped: rows.length === EXPORT_LIMIT },
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

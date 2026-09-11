import { db, schema } from '@nuxthub/db'
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { auditList } from '#shared/utils/audit-list'
import { AUDIT_ACTIONS, AUDIT_ACTION_NAMES } from '#shared/utils/audit-actions'
import { tableColumns, whereFrom } from './list-filters'
import type { AuditActionName, AuditModule } from '#shared/utils/audit-actions'
import type { FilterCondition, ListQuery } from '#shared/utils/list-filters'
import type { ListClause, Reference } from './list-filters'
import type { SQL } from 'drizzle-orm'

// The predicate the trail is read through, kept out of the handlers so the listing and its CSV
// export cannot drift into answering different questions (J-103 criterion 1).

export interface AuditFilters {
  actor?: string
  action?: AuditActionName
  module?: AuditModule
  target?: string
  from?: number
  to?: number
}

// A module is a property of the action, not a column, so it resolves to the actions it covers.
export function actionsInModule(module: AuditModule): AuditActionName[] {
  return AUDIT_ACTION_NAMES.filter(name => AUDIT_ACTIONS[name].module === module)
}

// The CSV export's own shape: a plain filter object, never paged (J-103 criterion 5).
export function auditPredicate(filters: AuditFilters): SQL | undefined {
  const terms: SQL[] = []

  if (filters.actor) terms.push(eq(schema.auditLog.actorId, filters.actor))
  if (filters.action) terms.push(eq(schema.auditLog.action, filters.action))
  if (filters.module) terms.push(inArray(schema.auditLog.action, actionsInModule(filters.module)))
  if (filters.target) terms.push(eq(schema.auditLog.target, filters.target))
  if (filters.from !== undefined) terms.push(gte(schema.auditLog.createdAt, filters.from))
  if (filters.to !== undefined) terms.push(lte(schema.auditLog.createdAt, filters.to))

  return terms.length ? and(...terms) : undefined
}

export async function auditTotal(where: SQL | undefined): Promise<number> {
  const [row] = await db.select({ total: sql<number>`count(*)` }).from(schema.auditLog).where(where)
  return Number(row?.total ?? 0)
}

// `rowid` is insertion order and not a Drizzle column; `id` is a random UUID and no guide to it.
// Qualified: the listing joins two other tables, each with a `rowid` of its own.
export function auditColumn(name: string): Reference | undefined {
  if (name === 'rowid') return sql`${schema.auditLog}.rowid`
  return tableColumns(schema.auditLog)(name)
}

function moduleCondition(condition: FilterCondition): SQL {
  return inArray(schema.auditLog.action, actionsInModule(condition.values[0] as AuditModule))
}

// The trail's own declaration, read through the same predicate the listing and the export both
// use (K-129), so the two can never answer a different question from one another.
export function auditClause(query: ListQuery): ListClause {
  return whereFrom(auditList, query, {
    column: auditColumn,
    search: [schema.auditLog.target],
    fields: { module: moduleCondition },
  })
}

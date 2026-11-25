// Reports keeps no figures of its own. A saved report is a question; a run is one working-out of a
// question, kept as files (the CSV and the page's JSON) until reports.runs.keep-for passes.
import { integer, text, check, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { col, defineTable } from '#kit/db'

export const DEFINITION_KINDS = ['figures', 'people'] as const
export const DEFINITION_STATES = ['active', 'archived'] as const
export const RUN_STATES = ['queued', 'running', 'done', 'failed', 'expired', 'stale'] as const

const inList = (values: readonly string[]) => sql.raw(values.map(v => `'${v}'`).join(', '))

/** A saved report: figures and formulas, a breakdown, a scope kind and a period rule (B1 to B7). */
export const definitions = defineTable('reports_definitions', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  description: col.internal(text('description')),
  kind: col.internal(text('kind', { enum: DEFINITION_KINDS }).notNull().default('figures')),
  basedOn: col.internal(text('based_on')),
  columns: col.internal(text('columns', { mode: 'json' }).notNull()),
  rowsBy: col.internal(text('rows_by')),
  acrossBy: col.internal(text('across_by')),
  filters: col.internal(text('filters', { mode: 'json' })),
  scopeKind: col.internal(text('scope_kind').notNull()),
  scopeId: col.internal(text('scope_id')),
  periodRule: col.internal(text('period_rule').notNull()),
  chart: col.internal(text('chart')),
  shareRole: col.internal(text('share_role')),
  madeBy: col.account('made_by', { role: 'actor' }),
  state: col.internal(text('state', { enum: DEFINITION_STATES }).notNull().default('active')),
  createdAt: col.createdAt(),
  updatedAt: col.updatedAt(),
}, {
  id: 'rpd',
  realm: 'operational',
  subject: 'none',
  extra: t => [
    index('reports_definitions_state').on(t.state, t.name),
    check('reports_definitions_kind', sql`${t.kind} IN (${inList(DEFINITION_KINDS)})`),
    check('reports_definitions_state_values', sql`${t.state} IN (${inList(DEFINITION_STATES)})`),
    check('reports_definitions_name', sql`length(${t.name}) BETWEEN 1 AND 80`),
  ],
})

/**
 * One working-out of a report (rules R1 to R8). Its question is stored when it is queued, so a later
 * change to the report never changes a copy. The state moves once each way by a conditional write.
 */
export const runs = defineTable('reports_runs', {
  id: col.id(),
  definitionId: col.ref('reports_definitions', { nullable: true }),
  reportKey: col.internal(text('report_key')),
  question: col.internal(text('question', { mode: 'json' }).notNull()),
  requestedBy: col.account('requested_by', { role: 'actor' }),
  state: col.internal(text('state', { enum: RUN_STATES }).notNull().default('queued')),
  rowsCount: col.internal(integer('rows_count')),
  unavailable: col.internal(text('unavailable', { mode: 'json' }).notNull().default(sql`'[]'`)),
  headline: col.internal(text('headline', { mode: 'json' })),
  // Plain ids, not references: the files sweep deletes a copy's files when they expire.
  fileId: col.internal(text('file_id')),
  dataFileId: col.internal(text('data_file_id')),
  failure: col.internal(text('failure')),
  startedAt: col.timestamp('started_at'),
  finishedAt: col.timestamp('finished_at'),
  createdAt: col.createdAt(),
}, {
  id: 'rpr',
  realm: 'operational',
  subject: 'none',
  retention: 'reports.runs.keep-for',
  extra: t => [
    index('reports_runs_requested').on(t.requestedBy, t.createdAt),
    index('reports_runs_state').on(t.state, t.finishedAt),
    check('reports_runs_state_values', sql`${t.state} IN (${inList(RUN_STATES)})`),
    check('reports_runs_one_report', sql`(${t.definitionId} IS NULL) <> (${t.reportKey} IS NULL)`),
    check('reports_runs_rows', sql`${t.rowsCount} IS NULL OR ${t.rowsCount} >= 0`),
  ],
})

export const tables = { definitions, runs }

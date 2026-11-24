// Saved reports (REP-12, REP-13, REP-33, REP-42, REP-43): a theatre's own question, built from
// figures and formulas, a breakdown, a pivot and a filter. Saving checks every rule at once and
// names the column at fault; opening one still checks each figure's ability (D4, M3).
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { can, first, inAccountScope, newId, nowMs, refuse, siteWords, useDb, useSetting, type Actor, type UnitView } from '#kit'
import { listMeasures, type MeasureListing } from '#modules/core'
import { figureColumns, readyMadeFor, scopeTitle, viewBase, type ViewQuery } from './ready-made'
import { keyLabels, keyValues } from './keys'
import { keyParam } from './query'
import { FormulaError, formulaUnit, parseFormula, type ColumnKind } from '../shared/formula'
import { PAGE_BREAKDOWNS, PERIOD_RULES, SCOPE_KINDS, type ReportColumn, type ReportView, type StoredColumn } from '../shared/reports'

const ID = /^[a-z]+_[A-Za-z0-9]+$/ // not-policy: the shape of a record id
const VALUE = /^[A-Za-z0-9_-]+$/ // not-policy: the shape of a key's value
const RECORD_PREFIX = { season: 'sea_', production: 'prd_', venue: 'ven_' } as const

const columnInput = z.union([
  z.object({ measure: z.string().max(80) }).strict(), // not-policy: a figure id's length
  z.object({ formula: z.string().max(200), label: z.string().trim().min(1).max(60) }).strict(), // not-policy: a formula is a line; a label fits a column head
])

export const definitionInput = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: the data model's bound
  description: z.string().trim().max(300).nullable().optional(), // not-policy: the data model's bound
  basedOn: z.string().max(80).nullable().optional(), // not-policy: a report id's length
  columns: z.array(columnInput).min(1).max(200), // not-policy: the setting's own ceiling
  rowsBy: keyParam.nullable().optional(),
  acrossBy: z.enum(PAGE_BREAKDOWNS).nullable().optional(),
  filter: z.object({ key: keyParam, values: z.array(z.string().regex(VALUE)).min(1).max(20) }).nullable().optional(), // not-policy: R3-27's bound
  scopeKind: z.enum(SCOPE_KINDS),
  scopeId: z.string().regex(ID).nullable().optional(),
  periodRule: z.enum(PERIOD_RULES),
  chart: z.enum(['bar', 'line']).nullable().optional(),
  shareRole: z.string().regex(ID).nullable().optional(),
})
export type DefinitionInput = z.infer<typeof definitionInput>

export interface DefinitionRow {
  id: string
  name: string
  description: string | null
  kind: 'figures' | 'people'
  based_on: string | null
  columns: string
  rows_by: string | null
  across_by: string | null
  filters: string | null
  scope_kind: ReportView['scopeKind']
  scope_id: string | null
  period_rule: ReportView['periodRule']
  chart: 'bar' | 'line' | null
  share_role: string | null
  made_by: string
  state: 'active' | 'archived'
  updated_at: number
}

const FORMULA_FAULTS: Record<string, string> = {
  'too-long': 'This formula is too long.',
  'whole-numbers': 'Use whole numbers only.',
  'number-too-large': 'This number is too large.',
  'column-number': 'Name a column as C and its number, such as C1.',
  'later-column': 'A formula can use only the columns before it.',
  'unknown-character': 'Use only columns, whole numbers, + − × ÷ and brackets.',
  'unclosed-bracket': 'A bracket is not closed.',
  'ends-early': 'The formula stops before it is finished.',
  'unexpected': 'Something here does not belong.',
  'expected-value': 'A column or a number is missing here.',
  'no-column': 'A formula uses at least one column.',
  'empty': 'Write a formula.',
  'not-addable': 'A count of different people or a level can be divided, but never added or taken away.',
  'units-differ': 'Add or take away columns of the same kind only, such as money and money.',
  'units-multiply': 'Multiply a column by a number only.',
  'units-divide': 'Divide money or a count by a count, a count by a count for a percentage, or anything by a number.',
}

interface ColumnCheck {
  readable: Map<string, MeasureListing>
  fields: Record<string, string>
  kinds: ColumnKind[]
  stored: StoredColumn[]
  figures: MeasureListing[]
}

function checkMeasure(c: { measure: string }, i: number, run: ColumnCheck) {
  const m = run.readable.get(c.measure)
  if (!m) run.fields[`columns.${i}`] = 'Choose a figure you can see.'
  else run.figures.push(m)
  run.kinds.push({ unit: m?.unit ?? 'count', combine: m?.combine ?? 'sum' })
  run.stored.push({ measure: c.measure })
}

const PLAIN_FAULTS = new Set(['not-addable', 'no-column', 'empty'])

function formulaFault(error: FormulaError): string {
  const at = error.code.startsWith('units') || PLAIN_FAULTS.has(error.code) ? '' : ` (at character ${error.at})`
  return `${(FORMULA_FAULTS[error.code] ?? 'This formula cannot be worked out.').replace(/\.$/, '')}${at}.`
}

function checkFormula(c: { formula: string, label: string }, i: number, run: ColumnCheck) {
  try {
    const unit = formulaUnit(parseFormula(c.formula, i), run.kinds)
    run.kinds.push({ unit, combine: 'sum' })
    run.stored.push({ formula: c.formula.trim(), label: c.label, unit })
  }
  catch (error) {
    if (!(error instanceof FormulaError)) throw error
    run.fields[`columns.${i}`] = formulaFault(error)
    run.kinds.push({ unit: 'count', combine: 'sum' })
  }
}

/** The breakdown, pivot, chart and filter each need every figure to allow them (B2, B6). */
function checkKeys(input: DefinitionInput, figures: MeasureListing[], fields: Record<string, string>) {
  const say = siteWords()
  const notBy = (key: string, list: 'by' | 'filters') => figures.find(m => !m[list].includes(key))
  const rowsOdd = input.rowsBy ? notBy(input.rowsBy, 'by') : undefined
  if (rowsOdd) fields.rowsBy = `${say(rowsOdd.label)} cannot be broken down this way.`
  if (input.acrossBy) {
    const odd = notBy(input.acrossBy, 'by')
    if (input.acrossBy === input.rowsBy) fields.acrossBy = 'Choose a different key from the rows.'
    else if (odd) fields.acrossBy = `${say(odd.label)} cannot be broken down this way.`
    if (input.chart) fields.chart = 'A report with columns across the top has no chart.'
  }
  const filterOdd = input.filter ? notBy(input.filter.key, 'filters') : undefined
  if (filterOdd) fields.filter = `${say(filterOdd.label)} cannot be narrowed this way.`
}

/** The scope, role and starting report the report names must exist. */
async function checkReferences(input: DefinitionInput, actor: Actor, fields: Record<string, string>) {
  if (input.scopeId) {
    const prefix = input.scopeKind === 'none' ? null : RECORD_PREFIX[input.scopeKind]
    if (!prefix || !input.scopeId.startsWith(prefix)) fields.scopeId = 'Choose one of the kind the report is about.'
    else await scopeTitle(input.scopeKind, input.scopeId)
  }
  if (input.shareRole && !(await first('SELECT 1 AS one FROM core_roles WHERE id = ? AND archived_at IS NULL', input.shareRole))) fields.shareRole = 'Choose a role that exists.'
  if (input.basedOn && !(await readyMadeFor(actor)).some(r => r.report.id === input.basedOn)) fields.basedOn = 'There is no such report.'
}

/** Checks a saved report against every rule at once (B1 to B6, D1) and gives the columns to store. */
export async function checkDefinition(input: DefinitionInput, actor: Actor): Promise<StoredColumn[]> {
  const fields: Record<string, string> = {}
  const max = await useSetting('reports.builder.max-columns') as number
  if (input.columns.length > max) fields.columns = `A report has at most ${max} columns.`
  const readable = new Map((await listMeasures(actor)).map(m => [m.id, m]))
  const run: ColumnCheck = { readable, fields, kinds: [], stored: [], figures: [] }
  input.columns.forEach((c, i) => 'measure' in c ? checkMeasure(c, i, run) : checkFormula(c, i, run))
  if (!run.figures.length && !fields.columns) fields.columns = 'A report needs at least one figure.'
  checkKeys(input, run.figures, fields)
  await checkReferences(input, actor, fields)
  if (Object.keys(fields).length) refuse('reports.definition.invalid', 'Some of this report needs changing.', { status: 422, fields })
  return run.stored
}

const params = (input: DefinitionInput, columns: StoredColumn[]) => [
  input.name, input.description || null, input.basedOn ?? null, JSON.stringify(columns), input.rowsBy ?? null, input.acrossBy ?? null,
  input.filter ? JSON.stringify(input.filter) : null, input.scopeKind, input.scopeId ?? null, input.periodRule, input.chart ?? null, input.shareRole ?? null,
]

const NAME_TAKEN = { code: 'reports.definition.name-taken', reason: 'Another report already has this name.', remedy: 'Choose a different name.' }

export async function createDefinition(unit: UnitView, actor: Actor, input: DefinitionInput): Promise<{ id: string }> {
  const columns = await checkDefinition(input, actor)
  const id = newId('rpd')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO reports_definitions (id, name, description, based_on, columns, rows_by, across_by, filters, scope_kind, scope_id, period_rule, chart, share_role, kind, made_by, state, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'figures', ?, 'active', ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM reports_definitions WHERE state = 'active' AND lower(name) = lower(?))`,
    params: [id, ...params(input, columns), actor.accountId!, at, at, input.name],
  }).expect(1, NAME_TAKEN)
  unit.audit({ action: 'create', record: ['reports.definition', id], detail: { columns: columns.length, shared: !!input.shareRole } })
  return { id }
}

export const definitionById = (id: string) => first<DefinitionRow>('SELECT * FROM reports_definitions WHERE id = ?', id)

async function isMaker(actor: Actor, id: string): Promise<boolean> {
  return !!actor.accountId && !!(await useDb().get(sql`SELECT 1 AS one FROM reports_definitions WHERE id = ${id} AND ${inAccountScope('made_by', actor.accountId)}`))
}

/** The maker may change their own report while they may still make reports; a manager may change any. */
async function mayEdit(actor: Actor, row: DefinitionRow): Promise<boolean> {
  if ((await can(actor, 'reports.report.manage' as never, ['reports.definition', row.id])).allowed) return true
  return await isMaker(actor, row.id) && (await can(actor, 'reports.report.create' as never)).allowed
}

/** The roles this person holds, from their grants, for reports shared with a role (D4). */
const rolesOf = (actor: Actor) => (actor.grants ?? []).map(g => g.via).filter(v => v.startsWith('role:')).map(v => v.slice('role:'.length))

/** Whether this person may open a saved report: its maker, a manager, or a holder of the role it is shared with. */
async function mayOpen(actor: Actor, row: DefinitionRow): Promise<boolean> {
  if (!(await can(actor, 'reports.report.view' as never)).allowed) return false
  if (row.share_role && rolesOf(actor).includes(row.share_role)) return true
  return await mayEdit(actor, row) || await isMaker(actor, row.id)
}

async function editable(actor: Actor, id: string): Promise<DefinitionRow> {
  const row = await definitionById(id)
  if (!row || !(await mayEdit(actor, row))) return refuse('reports.definition.unknown', 'There is no such report, or you cannot change it.', { status: 404 })
  return row
}

export async function updateDefinition(unit: UnitView, actor: Actor, id: string, input: DefinitionInput): Promise<void> {
  const row = await editable(actor, id)
  const columns = await checkDefinition(input, actor)
  unit.add({
    sql: `UPDATE reports_definitions SET name = ?, description = ?, based_on = ?, columns = ?, rows_by = ?, across_by = ?, filters = ?, scope_kind = ?, scope_id = ?, period_rule = ?, chart = ?, share_role = ?, updated_at = ?
           WHERE id = ? AND updated_at = ? AND NOT EXISTS (SELECT 1 FROM reports_definitions WHERE state = 'active' AND id <> ? AND lower(name) = lower(?))`,
    params: [...params(input, columns), nowMs(), id, row.updated_at, id, input.name],
  }).expect(1, NAME_TAKEN)
  unit.audit({ action: 'update', record: ['reports.definition', id], detail: { columns: columns.length, shared: !!input.shareRole } })
}

/** Archives a saved report, or brings it back (REP-13); the toast offers Undo. */
export async function setArchived(unit: UnitView, actor: Actor, id: string, archived: boolean): Promise<void> {
  const row = await editable(actor, id)
  const [from, to] = archived ? ['active', 'archived'] : ['archived', 'active']
  unit.add({
    sql: `UPDATE reports_definitions SET state = ?, updated_at = ? WHERE id = ? AND state = ?${archived ? '' : ' AND NOT EXISTS (SELECT 1 FROM reports_definitions WHERE state = \'active\' AND lower(name) = lower(?))'}`,
    params: archived ? [to, nowMs(), id, from] : [to, nowMs(), id, from, row.name],
  }).expect(1, archived ? undefined : NAME_TAKEN)
  unit.audit({ action: 'state', record: ['reports.definition', id], detail: { to } })
}

export interface SavedListing { id: string, name: string, description: string | null, basedOn: string | null, mine: boolean, shared: boolean, archived: boolean, editable: boolean }

/** The saved reports this person may open: their own, those shared with a role they hold, all for a manager. */
export async function savedFor(actor: Actor): Promise<SavedListing[]> {
  if (!(await can(actor, 'reports.report.view' as never)).allowed) return []
  const manager = (await can(actor, 'reports.report.manage' as never)).allowed
  const creator = (await can(actor, 'reports.report.create' as never)).allowed
  const mine = actor.accountId ? inAccountScope('made_by', actor.accountId) : sql`0`
  const roles = rolesOf(actor)
  const shared = roles.length ? sql`share_role IN (SELECT value FROM json_each(${JSON.stringify(roles)}))` : sql`0`
  const rows = await useDb().all<DefinitionRow & { is_mine: number }>(sql`SELECT *, (${mine}) AS is_mine FROM reports_definitions ${manager ? sql`` : sql`WHERE (${mine}) OR (${shared})`} ORDER BY lower(name)`)
  return rows.map(r => ({ id: r.id, name: r.name, description: r.description, basedOn: r.based_on, mine: !!r.is_mine, shared: !!r.share_role, archived: r.state === 'archived', editable: manager || (!!r.is_mine && creator) }))
}

/** A saved report as the page draws it, or as the builder edits it. */
export async function savedView(id: string, actor: Actor, query: ViewQuery): Promise<ReportView> {
  const row = await definitionById(id)
  if (!row || !(await mayOpen(actor, row))) return refuse('reports.definition.unknown', 'There is no such report, or you cannot open it.', { status: 404 })
  const stored = JSON.parse(row.columns) as StoredColumn[]
  const figures = await figureColumns(stored.flatMap(c => 'measure' in c ? [c.measure] : []), actor)
  let next = 0
  const columns: ReportColumn[] = stored.map(c => 'measure' in c ? figures[next++]! : { kind: 'formula', formula: c.formula, label: c.label, unit: c.unit })
  const scopeQuery = query.scope ?? (row.scope_id && row.scope_kind !== 'none' ? { kind: row.scope_kind, id: row.scope_id } : null)
  const base = await viewBase(columns, actor, { ...query, scope: scopeQuery }, { scopeKind: row.scope_kind, periodRule: row.period_rule })
  const filter = row.filters ? JSON.parse(row.filters) as { key: string, values: string[] } : null
  const filterLabels = filter ? Object.fromEntries((await keyValues(filter.key)).filter(v => filter.values.includes(v.value)).map(v => [v.value, v.label])) : {}
  const extraKeys = [row.across_by, filter?.key].filter((k): k is string => !!k)
  return {
    ...base,
    keyLabels: { ...base.keyLabels, ...await keyLabels(extraKeys) },
    source: 'saved', id: row.id, name: { text: row.name }, description: row.description ? { text: row.description } : null,
    usualBy: row.rows_by, chart: row.chart, acrossBy: row.across_by,
    filter: filter ? { ...filter, labels: filterLabels } : null,
    saved: { editable: await mayEdit(actor, row), basedOn: row.based_on, shareRole: row.share_role, archived: row.state === 'archived' },
  }
}

/** A saved report as its form shows it, for its maker or a manager. */
export async function formOf(id: string, actor: Actor): Promise<DefinitionInput & { id: string }> {
  const row = await editable(actor, id)
  const columns = (JSON.parse(row.columns) as StoredColumn[]).map(c => 'measure' in c ? { measure: c.measure } : { formula: c.formula, label: c.label })
  return {
    id: row.id, name: row.name, description: row.description, basedOn: row.based_on, columns, rowsBy: row.rows_by, acrossBy: row.across_by as DefinitionInput['acrossBy'],
    filter: row.filters ? JSON.parse(row.filters) : null, scopeKind: row.scope_kind, scopeId: row.scope_id, periodRule: row.period_rule, chart: row.chart, shareRole: row.share_role,
  }
}

/** What the builder starts from when saving a copy of a ready-made report (K2). */
export async function draftFrom(reportId: string, actor: Actor): Promise<DefinitionInput> {
  const found = (await readyMadeFor(actor)).find(r => r.report.id === reportId) ?? refuse('reports.report.unknown', 'There is no such report, or you cannot open it.', { status: 404 })
  const { report } = found
  return { name: '', basedOn: report.id, columns: report.figures.map(measure => ({ measure })), rowsBy: report.breakdown ?? null, acrossBy: null, filter: null, scopeKind: report.scope, scopeId: null, periodRule: report.period, chart: report.chart ?? null, shareRole: null }
}

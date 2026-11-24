// Copies of a report (rules R1 to R8, REP-09 to REP-11). "Keep a copy" and "Download CSV" queue a
// run with its question worked out and stored; the bulk job reads every figure as the person who
// asked, lays the table out as the page does and keeps it as a CSV and as JSON for the copy's page.
// Opening a copy checks today's abilities, not the requester's then.
import { sql } from 'drizzle-orm'
import { can, createUnit, first, inAccountScope, isRefusal, log, newId, nowMs, refuse, siteWords, theatreTimeZone, useDb, useSetting, type Actor, type UnitView } from '#kit'
import { listMeasures, storedFileBytes, storeFile } from '#modules/core'
import { readFigure } from './figures'
import { reportView, type ViewQuery } from './ready-made'
import { savedView } from './definitions'
import { expirePeople, mayOpenPeople, peopleCopy } from './people'
import type { PeopleTable } from '../shared/people'
import { gather, readsFor } from '../shared/plan'
import { cellKey, layOut, type OkAnswer, type ReportTable } from '../shared/table'
import type { FigureAnswer, FigureColumn, PeriodRule, ReportColumn, ReportView, ScopeKind, Words } from '../shared/reports'

export const RUN_CSV = 'reports.run-csv'
export const RUN_DATA = 'reports.run-data'
const OWNER = 'reports.run'
const HEADLINE_MAX = 6 // not-policy: the spec's headline width, which an email shows

/** Exactly what a run answers (R4), stored when it is queued. */
export interface RunQuestion {
  /** A people report's copy keeps its rows in reports_person_rows (P5); left out for figures. */
  kind?: 'people'
  source: ReportView['source']
  report: string
  name: Words
  columns: ReportColumn[]
  rowsBy?: string
  acrossBy?: string
  filter: ReportView['filter']
  keyLabels: Record<string, string>
  scope: { kind: ScopeKind, id: string | null, title: string | null }
  period: { rule: PeriodRule, from: string, to: string }
}

export interface RunRow {
  id: string
  report_key: string | null
  definition_id: string | null
  question: string
  requested_by: string
  state: 'queued' | 'running' | 'done' | 'failed' | 'expired' | 'stale'
  rows_count: number | null
  unavailable: string
  headline: string | null
  file_id: string | null
  data_file_id: string | null
  failure: string | null
  created_at: number
  finished_at: number | null
}

export interface Headline { measure: string, value: number, currency?: string }
export interface Unavailable { measure: string, reason: string }

/** A report as the reader sees it now: a saved one by its rpd_ id, else a ready-made one. */
export const viewOf = (id: string, actor: Actor, query: ViewQuery) => id.startsWith('rpd_') ? savedView(id, actor, query) : reportView(id, actor, query)

const wordsOf = (words: Words) => 'key' in words ? siteWords()(words.key) : words.text

/** Queues a copy of a report as the reader sees it now (R1, R4). */
export async function queueRun(unit: UnitView, actor: Actor, reportId: string, query: ViewQuery & { by?: string[] }): Promise<{ id: string }> {
  const view = await viewOf(reportId, actor, query)
  if (view.kind === 'people') refuse('reports.run.people', 'A report about people is kept as a copy from its own page.', { status: 422 })
  if (view.scopeKind !== 'none' && !view.scope.id) refuse('reports.run.no-scope', 'Choose what the report is about first.', { status: 422, fields: { scope: 'Choose one.' } })
  const rowsBy = query.by?.[0]
  if (rowsBy && !view.breakdowns.includes(rowsBy)) refuse('reports.run.breakdown', 'This report cannot be broken down that way.', { status: 422, fields: { by: 'Choose another breakdown.' } })
  if (!view.columns.some(c => c.kind === 'figure' && c.readable)) refuse('reports.run.nothing-readable', 'You cannot see any of this report\'s figures.', { status: 403 })
  const question: RunQuestion = {
    source: view.source, report: view.id, name: view.name, columns: view.columns, rowsBy, acrossBy: view.acrossBy ?? undefined,
    filter: view.filter, keyLabels: view.keyLabels, scope: view.scope, period: view.period,
  }
  const id = newId('rpr')
  const saved = view.source === 'saved'
  unit.add({
    sql: "INSERT INTO reports_runs (id, report_key, definition_id, question, requested_by, state, unavailable, created_at) VALUES (?, ?, ?, ?, ?, 'queued', '[]', ?)",
    params: [id, saved ? null : view.id, saved ? view.id : null, JSON.stringify(question), actor.accountId!, nowMs()],
  })
  unit.enqueue('reports.run-report', { runId: id })
  unit.audit({ action: 'create', record: [OWNER, id], detail: { report: view.id, columns: view.columns.length } })
  return { id }
}

export const runById = (id: string) => first<RunRow>('SELECT * FROM reports_runs WHERE id = ?', id)

/** The job (R2, R3): claims the run, works it out as its requester and keeps the files. */
export async function runReport(runId: string): Promise<void> {
  const run = await runById(runId)
  if (!run || run.state !== 'queued') return
  try {
    const claim = createUnit()
    claim.add({ sql: "UPDATE reports_runs SET state = 'running', started_at = ? WHERE id = ? AND state = 'queued'", params: [nowMs(), runId] }).expect(1)
    await claim.commit()
  }
  catch (error) {
    // Another message for the same run got there first.
    if (isRefusal(error)) return
    throw error
  }
  const question = JSON.parse(run.question) as RunQuestion
  try {
    const table = await workOut({ kind: 'person', accountId: run.requested_by }, question)
    const limit = await useSetting('reports.runs.row-limit') as number
    if (table.rows.length > limit) return await failRun(runId, 'reports.run.too-large')
    const at = nowMs()
    const unit = createUnit()
    const view = unit.view()
    const kept = { ownerType: OWNER, ownerId: runId, title: wordsOf(question.name), expiresAt: await filesExpireAt(at) }
    const fileId = await storeFile(view, { ...kept, slot: RUN_CSV, bytes: new TextEncoder().encode(await csvOf(question, table)), mediaType: 'text/csv' })
    const dataFileId = await storeFile(view, { ...kept, slot: RUN_DATA, bytes: new TextEncoder().encode(JSON.stringify(table)), mediaType: 'application/json' })
    view.add({
      sql: "UPDATE reports_runs SET state = 'done', rows_count = ?, unavailable = ?, headline = ?, file_id = ?, data_file_id = ?, finished_at = ? WHERE id = ? AND state = 'running'",
      params: [table.rows.length, JSON.stringify(unavailableOf(table)), JSON.stringify(headlineOf(table)), fileId, dataFileId, at, runId],
    }).expect(1)
    await unit.commit()
  }
  catch (error) {
    log.warn('reports.run.failed', { runId, error: String((error as Error)?.message ?? error) })
    await failRun(runId, isRefusal(error) ? error.code : 'reports.run.failed')
  }
}

async function failRun(runId: string, code: string): Promise<void> {
  const unit = createUnit()
  unit.add({ sql: "UPDATE reports_runs SET state = 'failed', failure = ?, finished_at = ? WHERE id = ? AND state = 'running'", params: [code, nowMs(), runId] })
  await unit.commit()
}

/** Every read the question needs, as `actor`, laid out as the page does (B7). */
export async function workOut(actor: Actor, question: RunQuestion): Promise<ReportTable> {
  const base = { from: question.period.from, to: question.period.to, filter: question.filter ? { key: question.filter.key, values: question.filter.values } : null, scope: question.scope.id ? { kind: question.scope.kind, id: question.scope.id } as ViewQuery['scope'] : undefined }
  const reads = readsFor(question.columns, question.rowsBy, question.acrossBy)
  const answers: FigureAnswer[] = await Promise.all(reads.map(r => readFigure(actor, { ...base, id: r.figure, by: r.by })))
  const max = await useSetting('reports.builder.max-columns') as number
  const table = layOut(question.columns, gather(reads, answers), { rowsBy: question.rowsBy, acrossBy: question.acrossBy, name: await namer(), totalLabel: siteWords()('reports.total') })
  const cells = table.groups.length * table.columns.filter(c => c.shown).length
  if (question.acrossBy && cells > max) refuse('reports.run.too-wide', `This would make ${cells} columns across, more than ${max}.`, { status: 422 })
  return table
}

/** Names a row or group on the server as the page would, in the theatre's language and time zone. */
async function namer(): Promise<(key: string, value: string, answer: OkAnswer) => { label: string, sortBy: string | number }> {
  const language = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const timeZone = await theatreTimeZone()
  const day = new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const month = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const when = new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone })
  return (key, value, answer) => {
    if (key === 'day') return { label: day.format(new Date(`${value}T12:00:00Z`)), sortBy: value }
    if (key === 'month') return { label: month.format(new Date(`${value}-15T12:00:00Z`)), sortBy: value }
    const title = answer.labels[value] ?? value
    const starts = key === 'performance' ? answer.starts?.[value] : undefined
    return starts ? { label: `${title}, ${when.format(starts)}`, sortBy: starts } : { label: title, sortBy: title.toLowerCase() }
  }
}

/** Figures that could not answer, or that the requester may not see, by their totals. */
function unavailableOf(table: ReportTable): Unavailable[] {
  const out: Unavailable[] = []
  table.columns.forEach((c, i) => {
    if (c.kind !== 'figure') return
    if (!c.shown) return void out.push({ measure: c.id, reason: c.gone ? 'gone' : 'hidden' })
    const total = table.totals[cellKey(i, null)]
    if (total && total.state !== 'ok') out.push({ measure: c.id, reason: total.state === 'unsupported' ? 'unsupported' : total.reason })
  })
  return out
}

/** The totals row's figures, for the list of copies and a schedule's email: never a person (M2). */
function headlineOf(table: ReportTable): Headline[] {
  const out: Headline[] = []
  table.columns.forEach((c, i) => {
    const total = table.totals[cellKey(i, null)]
    if (c.kind !== 'figure' || !c.shown || total?.state !== 'ok') return
    for (const a of total.amounts.length ? total.amounts : [{ value: 0 }]) out.push({ measure: c.id, value: a.value, ...(a.currency ? { currency: a.currency } : {}) })
  })
  return out.slice(0, HEADLINE_MAX)
}

/** A cell a spreadsheet would read as a formula starts with a quote mark instead. */
function cell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text) && typeof value !== 'number') text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** A key's name in words: Reports names the shared keys, a module its own. */
export const keyName = (key: string, labels: Record<string, string>) => siteWords()(labels[key] ?? `reports.by.${key}`)

/** The question in words, as the page says it, with the pivot and the filter. */
async function questionWords(question: RunQuestion): Promise<string[]> {
  const say = siteWords()
  const language = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const date = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const dayOf = (d: string) => date.format(new Date(`${d}T12:00:00Z`))
  const dates = question.period.from === question.period.to ? dayOf(question.period.from) : `${dayOf(question.period.from)} to ${dayOf(question.period.to)}`
  const by = (key: string | undefined) => key ? say('reports.by-sentence', { by: keyName(key, question.keyLabels).toLowerCase() }) : null
  const lines = [[question.scope.title, dates, by(question.rowsBy), question.acrossBy ? say('reports.across-sentence', { by: keyName(question.acrossBy, question.keyLabels).toLowerCase() }) : null].filter(Boolean).join(', ')]
  if (question.filter) lines.push(`${keyName(question.filter.key, question.keyLabels)}: ${question.filter.values.map(v => question.filter!.labels[v] ?? v).join(', ')}`)
  return lines
}

/**
 * The CSV (REP-09): the question in words first, a note row for each figure that could not answer,
 * then the table and its totals. Money is in major units with one column for each currency (M7); a
 * pivot's columns are named by their group and column.
 */
export async function csvOf(question: RunQuestion, table: ReportTable): Promise<string> {
  const say = siteWords()
  const siteCurrency = (await useSetting('core.locale.currency') as string | null) ?? 'GBP'
  const labelOf = (c: ReportColumn) => c.kind === 'formula' ? c.label : say(c.label)
  const columns = table.groups.flatMap(g => table.columns.flatMap((c, i) => {
    if (!c.shown) return []
    const head = `${question.acrossBy ? `${g.label} ` : ''}${labelOf(c)}`
    const keyOf = cellKey(i, g.value)
    if (c.unit !== 'money') return [{ column: c, key: keyOf, currency: undefined as string | undefined, label: c.unit === 'minutes' ? say('reports.csv.minutes', { figure: head }) : head }]
    const currencies = new Set<string>()
    for (const shown of [table.totals[keyOf], ...table.rows.map(r => r.cells[keyOf])]) if (shown?.state === 'ok') for (const a of shown.amounts) if (a.currency) currencies.add(a.currency)
    if (!currencies.size) currencies.add(siteCurrency)
    return [...currencies].sort().map(currency => ({ column: c, key: keyOf, currency, label: `${head} (${currency})` }))
  }))
  const value = (c: ReportColumn, currency: string | undefined, shown: ReportTable['totals'][string] | undefined): string | number => {
    if (!shown || shown.state !== 'ok') return '–'
    if (c.unit === 'money') {
      const minor = shown.amounts.filter(a => (a.currency ?? siteCurrency) === currency).reduce((s, a) => s + a.value, 0)
      const digits = new Intl.NumberFormat('en', { style: 'currency', currency: currency ?? siteCurrency }).resolvedOptions().maximumFractionDigits ?? 2
      return (minor / 10 ** digits).toFixed(digits) // not-policy: minor units to major
    }
    const total = shown.amounts.reduce((s, a) => s + a.value, 0)
    return c.unit === 'percent' ? total.toFixed(1) : Number.isInteger(total) ? total : total.toFixed(1)
  }
  const lines: (string | number)[][] = [[wordsOf(question.name)], ...(await questionWords(question)).map(w => [say('reports.csv.question'), w])]
  for (const u of unavailableOf(table)) {
    const figure = question.columns.find((c): c is FigureColumn => c.kind === 'figure' && c.id === u.measure)
    lines.push([say('reports.csv.not-available'), figure && !figure.gone ? say(figure.label) : u.measure, say(`reports.unavailable.${u.reason}`)])
  }
  lines.push([])
  lines.push([question.rowsBy ? keyName(question.rowsBy, question.keyLabels) : '', ...columns.map(c => c.label)])
  for (const row of table.rows) lines.push([row.label, ...columns.map(c => value(c.column, c.currency, row.cells[c.key]))])
  lines.push([say('reports.total'), ...columns.map(c => value(c.column, c.currency, table.totals[c.key]))])
  return `${lines.map(l => l.map(cell).join(',')).join('\r\n')}\r\n`
}

/**
 * Whether `actor` may open this copy today (R6): reports.run.view on it (its requester holds that
 * as owner) and, now, every figure's own ability for its scope. A figure no module declares any
 * longer cannot be checked, so the copy is not opened.
 */
export async function mayOpen(actor: Actor, run: Pick<RunRow, 'id' | 'question'>, checked = new Map<string, boolean>()): Promise<boolean> {
  const question = JSON.parse(run.question) as RunQuestion
  if (question.kind === 'people') return await mayOpenPeople(actor, run)
  if (!(await can(actor, 'reports.run.view' as never, [OWNER, run.id])).allowed) return false
  const abilities = new Map((await listMeasures(null)).map(m => [m.id, m.ability]))
  const record = question.scope.kind === 'production' && question.scope.id ? ['core.production', question.scope.id] as const : undefined
  for (const f of question.columns.filter((c): c is FigureColumn => c.kind === 'figure' && c.readable)) {
    const ability = abilities.get(f.id)
    if (!ability) return false
    const key = `${ability}:${record?.[1] ?? ''}`
    if (!checked.has(key)) checked.set(key, (await can(actor, ability as never, record)).allowed)
    if (!checked.get(key)) return false
  }
  return true
}

export interface RunSummary {
  id: string
  report: string
  name: Words
  question: RunQuestion
  state: RunRow['state']
  failure: string | null
  rows: number | null
  headline: Headline[]
  unavailable: Unavailable[]
  createdAt: number
  finishedAt: number | null
  mine: boolean
}

const RUNS_LISTED = 200 // not-policy: the newest copies the list shows

/** The copies this person may open, newest first: everyone's for a holder of reports.run.view, else their own. */
export async function listRuns(actor: Actor): Promise<RunSummary[]> {
  const everyone = (await can(actor, 'reports.run.view' as never)).allowed
  const mine = inAccountScope('requested_by', actor.accountId!)
  const rows = await useDb().all<RunRow>(sql`SELECT * FROM reports_runs ${everyone ? sql`` : sql`WHERE ${mine}`} ORDER BY created_at DESC LIMIT ${RUNS_LISTED}`)
  const own = new Set((await useDb().all<{ id: string }>(sql`SELECT id FROM reports_runs WHERE ${mine}`)).map(r => r.id))
  const checked = new Map<string, boolean>()
  const out: RunSummary[] = []
  for (const row of rows) if (await mayOpen(actor, row, checked)) out.push(summaryOf(row, own.has(row.id)))
  return out
}

export function summaryOf(row: RunRow, mine: boolean): RunSummary {
  const question = JSON.parse(row.question) as RunQuestion
  return {
    id: row.id, report: row.report_key ?? row.definition_id ?? '', name: question.name, question, state: row.state, failure: row.failure, rows: row.rows_count,
    headline: row.headline ? JSON.parse(row.headline) as Headline[] : [], unavailable: JSON.parse(row.unavailable) as Unavailable[],
    createdAt: row.created_at, finishedAt: row.finished_at, mine,
  }
}

/** One copy for its page, with the table as it was kept; refused as not found when it may not be opened. */
export async function openRun(actor: Actor, id: string): Promise<RunSummary & { table: ReportTable | null, people?: PeopleTable | null }> {
  const row = await runById(id)
  if (!row || !(await mayOpen(actor, row))) return refuse('reports.run.unknown', 'There is no such copy, or you cannot open it.', { status: 404 })
  if ((JSON.parse(row.question) as RunQuestion).kind === 'people') {
    const own = !!(await useDb().get(sql`SELECT 1 AS one FROM reports_runs WHERE id = ${id} AND ${inAccountScope('requested_by', actor.accountId!)}`))
    return { ...summaryOf(row, own), table: null, people: await peopleCopy(row) }
  }
  const bytes = row.state === 'done' && row.data_file_id ? await storedFileBytes(row.data_file_id, { type: OWNER, id }) : null
  const mine = !!(await useDb().get(sql`SELECT 1 AS one FROM reports_runs WHERE id = ${id} AND ${inAccountScope('requested_by', actor.accountId!)}`))
  return { ...summaryOf(row, mine), table: bytes ? JSON.parse(new TextDecoder().decode(bytes)) as ReportTable : null }
}

/** The copy's CSV, audited as an export (REP-09); refused once it has expired. */
export async function runCsv(unit: UnitView, actor: Actor, id: string): Promise<{ name: string, bytes: Uint8Array }> {
  const row = await runById(id)
  if (!row || !(await mayOpen(actor, row))) return refuse('reports.run.unknown', 'There is no such copy, or you cannot open it.', { status: 404 })
  const bytes = row.state === 'done' && row.file_id ? await storedFileBytes(row.file_id, { type: OWNER, id }) : null
  if (!bytes) return refuse('reports.run.no-file', 'This copy has no file to download.', { status: 409, remedy: 'Make a new copy from the report.' })
  unit.audit({ action: 'export', ability: 'reports.run.export', record: [OWNER, id], detail: { rows: row.rows_count ?? 0 } })
  const question = JSON.parse(row.question) as RunQuestion
  const name = `${question.report.split('.').pop()}-${question.period.from}-to-${question.period.to}.csv`
  return { name, bytes }
}

/** The daily task (R7, REP-11): copies past reports.runs.keep-for become expired, set-wise. */
export async function expireRuns(): Promise<void> {
  const keepFor = await useSetting('reports.runs.keep-for') as number
  const before = nowMs() - keepFor * 1000 // not-policy: seconds to milliseconds
  const unit = createUnit()
  unit.add({ sql: "UPDATE reports_runs SET state = 'expired', file_id = NULL, data_file_id = NULL WHERE state IN ('done', 'failed') AND coalesce(json_extract(question, '$.kind'), 'figures') <> 'people' AND finished_at < ?", params: [before] })
  await unit.commit()
  await expirePeople()
}

/** When a copy's files go: the keep-for in force when it was made; core's files sweep removes them. */
export async function filesExpireAt(at: number): Promise<number> {
  return at + (await useSetting('reports.runs.keep-for') as number) * 1000 // not-policy: seconds to milliseconds
}

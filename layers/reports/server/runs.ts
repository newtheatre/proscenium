// Copies of a report (rules R1 to R8, REP-09 to REP-11). "Keep a copy" and "Download CSV" queue a
// run with its question worked out and stored; the bulk job reads every figure as the person who
// asked, lays the table out as the page does and keeps it as a CSV and as JSON for the copy's page.
// Opening a copy checks today's abilities, not the requester's then.
import { sql } from 'drizzle-orm'
import { can, createUnit, first, inAccountScope, isRefusal, log, newId, nowMs, refuse, siteWords, theatreTimeZone, useDb, useSetting, type Actor, type UnitView } from '#kit'
import { listMeasures, storedFileBytes, storeFile } from '#modules/core'
import { readFigure } from './figures'
import { reportView, type ViewQuery } from './ready-made'
import { layOut, type Answers, type OkAnswer, type ReportTable } from '../shared/table'
import type { FigureColumn, PageBreakdown, PeriodRule, ScopeKind } from '../shared/reports'

export const RUN_CSV = 'reports.run-csv'
export const RUN_DATA = 'reports.run-data'
const OWNER = 'reports.run'
const HEADLINE_MAX = 6 // not-policy: the spec's headline width, which an email shows

/** Exactly what a run answers (R4), stored when it is queued. */
export interface RunQuestion {
  report: string
  label: string
  figures: FigureColumn[]
  by?: PageBreakdown
  scope: { kind: ScopeKind, id: string | null, title: string | null }
  period: { rule: PeriodRule, from: string, to: string }
}

export interface RunRow {
  id: string
  report_key: string | null
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

/** Queues a copy of a ready-made report as the reader sees it now (R1, R4). */
export async function queueRun(unit: UnitView, actor: Actor, reportId: string, query: ViewQuery & { by?: PageBreakdown }): Promise<{ id: string }> {
  const view = await reportView(reportId, actor, query)
  if (view.report.scope !== 'none' && !view.scope.id) refuse('reports.run.no-scope', 'Choose what the report is about first.', { status: 422, fields: { scope: 'Choose one.' } })
  if (query.by && !view.breakdowns.includes(query.by)) refuse('reports.run.breakdown', 'This report cannot be broken down that way.', { status: 422, fields: { by: 'Choose another breakdown.' } })
  const figures = view.figures.filter(f => f.readable)
  if (!figures.length) refuse('reports.run.nothing-readable', 'You cannot see any of this report\'s figures.', { status: 403 })
  const question: RunQuestion = { report: view.report.id, label: view.report.label, figures, by: query.by, scope: view.scope, period: view.period }
  const id = newId('rpr')
  unit.add({
    sql: "INSERT INTO reports_runs (id, report_key, question, requested_by, state, unavailable, created_at) VALUES (?, ?, ?, ?, 'queued', '[]', ?)",
    params: [id, view.report.id, JSON.stringify(question), actor.accountId!, nowMs()],
  })
  unit.enqueue('reports.run-report', { runId: id })
  unit.audit({ action: 'create', record: [OWNER, id], detail: { report: view.report.id, figures: figures.length } })
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
    const kept = { ownerType: OWNER, ownerId: runId, title: siteWords()(question.label), expiresAt: await filesExpireAt(at) }
    const fileId = await storeFile(view, { ...kept, slot: RUN_CSV, bytes: new TextEncoder().encode(await csvOf(question, table)), mediaType: 'text/csv' })
    const dataFileId = await storeFile(view, { ...kept, slot: RUN_DATA, bytes: new TextEncoder().encode(JSON.stringify(table)), mediaType: 'application/json' })
    view.add({
      sql: "UPDATE reports_runs SET state = 'done', rows_count = ?, unavailable = ?, headline = ?, file_id = ?, data_file_id = ?, finished_at = ? WHERE id = ? AND state = 'running'",
      params: [table.rows.length, JSON.stringify(unavailableOf(question, table)), JSON.stringify(headlineOf(table)), fileId, dataFileId, at, runId],
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

/** Every figure by the breakdown and as a total, read as `actor`, laid out as the page does. */
export async function workOut(actor: Actor, question: RunQuestion): Promise<ReportTable> {
  const base = { from: question.period.from, to: question.period.to, scope: question.scope.id ? { kind: question.scope.kind, id: question.scope.id } as ViewQuery['scope'] : undefined }
  const answers: Answers = {}
  await Promise.all(question.figures.map(async (f) => {
    const [rows, total] = await Promise.all([question.by ? readFigure(actor, { ...base, id: f.id, by: question.by }) : null, readFigure(actor, { ...base, id: f.id })])
    answers[f.id] = { rows, total }
  }))
  return layOut(question.figures, answers, question.by, await namer(question.by))
}

/** Names a row on the server as the page would, in the theatre's language and time zone. */
async function namer(by: PageBreakdown | undefined): Promise<(key: string, answer: OkAnswer) => { label: string, sortBy: string | number }> {
  const language = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const timeZone = await theatreTimeZone()
  const day = new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const month = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const when = new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone })
  return (key, answer) => {
    if (by === 'day') return { label: day.format(new Date(`${key}T12:00:00Z`)), sortBy: key }
    if (by === 'month') return { label: month.format(new Date(`${key}-15T12:00:00Z`)), sortBy: key }
    const title = answer.labels[key] ?? key
    const starts = answer.starts?.[key]
    return starts ? { label: `${title}, ${when.format(starts)}`, sortBy: starts } : { label: title, sortBy: title.toLowerCase() }
  }
}

function unavailableOf(question: RunQuestion, table: ReportTable): Unavailable[] {
  const shown = new Set(table.visible.map(f => f.id))
  const out: Unavailable[] = question.figures.filter(f => !shown.has(f.id)).map(f => ({ measure: f.id, reason: 'hidden' }))
  for (const f of table.visible) {
    const total = table.totals[f.id]
    if (total && total.state !== 'ok') out.push({ measure: f.id, reason: total.state === 'unsupported' ? 'unsupported' : total.reason })
  }
  return out
}

/** The totals row, for the list of copies and a schedule's email: never a person (M2). */
function headlineOf(table: ReportTable): Headline[] {
  const out: Headline[] = []
  for (const f of table.visible) {
    const total = table.totals[f.id]
    if (total?.state !== 'ok') continue
    for (const a of total.amounts.length ? total.amounts : [{ value: 0 }]) out.push({ measure: f.id, value: a.value, ...(a.currency ? { currency: a.currency } : {}) })
  }
  return out.slice(0, HEADLINE_MAX)
}

/** A cell a spreadsheet would read as a formula starts with a quote mark instead. */
function cell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text) && typeof value !== 'number') text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * The CSV (REP-09): the question in words first, a note row for each figure that could not answer,
 * then the table and its totals. Money is in major units with one column for each currency (M7).
 */
export async function csvOf(question: RunQuestion, table: ReportTable): Promise<string> {
  const say = siteWords()
  const language = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const date = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const dayOf = (d: string) => date.format(new Date(`${d}T12:00:00Z`))
  const siteCurrency = (await useSetting('core.locale.currency') as string | null) ?? 'GBP'
  const dates = question.period.from === question.period.to ? dayOf(question.period.from) : `${dayOf(question.period.from)} to ${dayOf(question.period.to)}`
  const columns = table.visible.flatMap((f) => {
    if (f.unit !== 'money') return [{ figure: f, currency: undefined as string | undefined, label: f.unit === 'minutes' ? say('reports.csv.minutes', { figure: say(f.label) }) : say(f.label) }]
    const currencies = new Set<string>()
    for (const shown of [table.totals[f.id], ...table.rows.map(r => r.cells[f.id])]) if (shown?.state === 'ok') for (const a of shown.amounts) if (a.currency) currencies.add(a.currency)
    if (!currencies.size) currencies.add(siteCurrency)
    return [...currencies].sort().map(currency => ({ figure: f, currency, label: `${say(f.label)} (${currency})` }))
  })
  const value = (f: FigureColumn, currency: string | undefined, shown: ReportTable['totals'][string] | undefined): string | number => {
    if (!shown || shown.state !== 'ok') return '–'
    if (f.unit === 'money') {
      const minor = shown.amounts.filter(a => (a.currency ?? siteCurrency) === currency).reduce((s, a) => s + a.value, 0)
      const digits = new Intl.NumberFormat('en', { style: 'currency', currency: currency ?? siteCurrency }).resolvedOptions().maximumFractionDigits ?? 2
      return (minor / 10 ** digits).toFixed(digits) // not-policy: minor units to major
    }
    const total = shown.amounts.reduce((s, a) => s + a.value, 0)
    return f.unit === 'percent' ? total.toFixed(1) : total
  }
  const lines: (string | number)[][] = [
    [say(question.label)],
    [say('reports.csv.question'), [question.scope.title, dates, question.by ? say('reports.by-sentence', { by: say(`reports.by.${question.by}`).toLowerCase() }) : null].filter(Boolean).join(', ')],
  ]
  for (const u of unavailableOf(question, table)) {
    const figure = question.figures.find(f => f.id === u.measure)
    lines.push([say('reports.csv.not-available'), figure ? say(figure.label) : u.measure, say(`reports.unavailable.${u.reason}`)])
  }
  lines.push([])
  lines.push([question.by ? say(`reports.by.${question.by}`) : '', ...columns.map(c => c.label)])
  for (const row of table.rows) lines.push([row.label, ...columns.map(c => value(c.figure, c.currency, row.cells[c.figure.id]))])
  lines.push([say('reports.total'), ...columns.map(c => value(c.figure, c.currency, table.totals[c.figure.id]))])
  return `${lines.map(l => l.map(cell).join(',')).join('\r\n')}\r\n`
}

/**
 * Whether `actor` may open this copy today (R6): reports.run.view on it (its requester holds that
 * as owner) and, now, every figure's own ability for its scope. A figure no module declares any
 * longer cannot be checked, so the copy is not opened.
 */
export async function mayOpen(actor: Actor, run: Pick<RunRow, 'id' | 'question'>, checked = new Map<string, boolean>()): Promise<boolean> {
  if (!(await can(actor, 'reports.run.view' as never, [OWNER, run.id])).allowed) return false
  const question = JSON.parse(run.question) as RunQuestion
  const abilities = new Map((await listMeasures(null)).map(m => [m.id, m.ability]))
  const record = question.scope.kind === 'production' && question.scope.id ? ['core.production', question.scope.id] as const : undefined
  for (const f of question.figures) {
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
  label: string
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
    id: row.id, report: row.report_key ?? '', label: question.label, question, state: row.state, failure: row.failure, rows: row.rows_count,
    headline: row.headline ? JSON.parse(row.headline) as Headline[] : [], unavailable: JSON.parse(row.unavailable) as Unavailable[],
    createdAt: row.created_at, finishedAt: row.finished_at, mine,
  }
}

/** One copy for its page, with the table as it was kept; refused as not found when it may not be opened. */
export async function openRun(actor: Actor, id: string): Promise<RunSummary & { table: ReportTable | null }> {
  const row = await runById(id)
  if (!row || !(await mayOpen(actor, row))) return refuse('reports.run.unknown', 'There is no such copy, or you cannot open it.', { status: 404 })
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
  unit.add({ sql: "UPDATE reports_runs SET state = 'expired', file_id = NULL, data_file_id = NULL WHERE state IN ('done', 'failed') AND finished_at < ?", params: [before] })
  await unit.commit()
}

/** When a copy's files go: the keep-for in force when it was made; core's files sweep removes them. */
export async function filesExpireAt(at: number): Promise<number> {
  return at + (await useSetting('reports.runs.keep-for') as number) * 1000 // not-policy: seconds to milliseconds
}

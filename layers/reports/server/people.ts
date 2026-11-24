// People reports (REP-35, REP-44, REP-45; rules P1 to P8): figures per named person, read only
// through core's readPersonMeasure, which checks both abilities and audits every read. A copy keeps
// account ids and numbers, never names; names are looked up today, and the CSV is made on the fly.
import { sql } from 'drizzle-orm'
import { can, createUnit, exactAccount, newId, nowMs, refuse, siteWords, useDb, useSetting, type Actor, type MergeRef, type SharedBreakdown, type UnitView } from '#kit'
import { accountLabels, listMeasures, listPersonMeasures, readPersonMeasure } from '#modules/core'
import { readFigure, labelsFor } from './figures'
import { measureScope, type ViewQuery } from './ready-made'
import { savedView } from './definitions'
import { keyName, runById, type Headline, type RunQuestion, type RunRow, type Unavailable } from './runs'
import type { FigureColumn, ReportView } from '../shared/reports'
import type { Shown } from '../shared/table'
import type { PeopleRow, PeopleTable } from '../shared/people'

const OWNER = 'reports.run'
export const PEOPLE_MAX = 6 // not-policy: rule P8, figures side by side

/** Person figure columns for measure ids, each marked readable or not, or gone when nobody offers it. */
export async function personColumns(ids: string[], actor: Actor): Promise<FigureColumn[]> {
  const all = new Map((await listPersonMeasures(null)).map(m => [m.id, m]))
  const readable = new Set((await listPersonMeasures(actor)).map(m => m.id))
  return ids.map((id) => {
    const m = all.get(id)
    return m
      ? { kind: 'figure', id, label: m.label, unit: m.unit, combine: m.combine, by: m.by, filters: [], readable: readable.has(id) }
      : { kind: 'figure', id, label: 'reports.figure-gone', unit: 'count', combine: 'sum', by: [], filters: [], readable: false, gone: true }
  })
}

/** A saved people report as the reader sees it now; any other report is not found here. */
export async function peopleView(id: string, actor: Actor, query: ViewQuery): Promise<ReportView> {
  const view = id.startsWith('rpd_') ? await savedView(id, actor, query) : null
  if (!view || view.kind !== 'people') return refuse('reports.definition.unknown', 'There is no such report, or you cannot open it.', { status: 404 })
  if (view.scopeKind !== 'none' && !view.scope.id) refuse('reports.run.no-scope', 'Choose what the report is about first.', { status: 422, fields: { scope: 'Choose one.' } })
  return view
}

function checkBy(view: ReportView, by: string | undefined): SharedBreakdown | undefined {
  if (by && !view.breakdowns.includes(by)) refuse('reports.run.breakdown', 'This report cannot be broken down that way.', { status: 422, fields: { by: 'Choose another breakdown.' } })
  return by as SharedBreakdown | undefined
}

/** Reads every figure per person the reader may see, and each total where its module offers one (P8). */
export async function readPeople(actor: Actor, view: ReportView, by?: string): Promise<PeopleTable> {
  const key = checkBy(view, by)
  const query = { from: view.period.from, to: view.period.to, ...(view.scope.id ? { scope: measureScope({ kind: view.scope.kind, id: view.scope.id }) } : {}), ...(key ? { by: key } : {}) }
  const columns = view.columns as FigureColumn[]
  const totalsOffered = new Set((await listMeasures(actor)).map(m => m.id))
  const unavailable: Unavailable[] = []
  const found = new Map<string, { person: string, key?: string, values: (number | null)[] }>()
  const totals: Shown[] = []
  for (const [i, c] of columns.entries()) {
    if (!c.readable) {
      totals.push({ state: 'unavailable', reason: c.gone ? 'gone' : 'hidden' })
      continue
    }
    const answer = await readPersonMeasure(c.id, query, actor)
    if (answer.state !== 'ok') {
      unavailable.push({ measure: c.id, reason: answer.state === 'unsupported' ? 'unsupported' : answer.reason })
      totals.push(answer.state === 'unsupported' ? { state: 'unsupported' } : { state: 'unavailable', reason: answer.reason })
      continue
    }
    for (const r of answer.rows) {
      const value = key ? r.keys?.[key] : undefined
      const id = `${r.person}|${value ?? ''}`
      const row = found.get(id) ?? { person: r.person, ...(value ? { key: value } : {}), values: columns.map(() => null) }
      row.values[i] = (row.values[i] ?? 0) + r.value
      found.set(id, row)
    }
    totals.push(totalsOffered.has(c.id) ? await totalOf(actor, c.id, view) : { state: 'unavailable', reason: 'no-total' })
  }
  const shown = columns.map(c => c.readable && !unavailable.some(u => u.measure === c.id))
  const rows = [...found.values()].map(r => ({ ...r, values: r.values.map((v, i) => shown[i] ? v ?? 0 : null) }))
  return await named(columns, rows, totals, unavailable, key, view.keyLabels)
}

async function totalOf(actor: Actor, id: string, view: ReportView): Promise<Shown> {
  const answer = await readFigure(actor, { id, from: view.period.from, to: view.period.to, scope: view.scope.id ? { kind: view.scope.kind, id: view.scope.id } as ViewQuery['scope'] : undefined })
  if (answer.state === 'ok') return { state: 'ok', amounts: answer.rows.length ? answer.rows.map(r => ({ value: r.value })) : [{ value: 0 }] }
  return answer.state === 'hidden' ? { state: 'unavailable', reason: 'hidden' } : answer
}

/** Names each person and key today, and sorts by the first figure shown, most first (P8). */
async function named(columns: FigureColumn[], rows: { person: string, key?: string, values: (number | null)[] }[], totals: Shown[], unavailable: Unavailable[], key: string | undefined, keyLabels: Record<string, string>): Promise<PeopleTable> {
  const names = await accountLabels(rows.map(r => r.person))
  const keys = key ? await labelsFor(key, rows.map(r => r.key)) : {}
  const first = rows[0]?.values.findIndex(v => v !== null) ?? -1
  const out: PeopleRow[] = rows.map(r => ({ person: r.person, name: names[r.person] ?? siteWords()('reports.people.former'), ...(r.key ? { key: r.key, keyLabel: keys[r.key] ?? r.key } : {}), values: r.values }))
  out.sort((a, b) => (first >= 0 ? (b.values[first] ?? 0) - (a.values[first] ?? 0) : 0) || a.name.localeCompare(b.name) || (a.keyLabel ?? '').localeCompare(b.keyLabel ?? ''))
  return {
    columns: columns.map(c => ({ id: c.id, label: c.label, unit: c.unit as 'count' | 'minutes', shown: c.readable && !unavailable.some(u => u.measure === c.id) })),
    rows: out, totals, unavailable, by: key ?? null, byLabel: key ? keyName(key, keyLabels) : null,
    hidden: columns.filter(c => !c.readable).length,
  }
}

/** Keeps a copy of a people report (REP-44): the rows go to reports_person_rows, never to a file. */
export async function keepPeople(unit: UnitView, actor: Actor, reportId: string, query: ViewQuery & { by?: string }): Promise<{ id: string }> {
  if (!(await can(actor, 'reports.people.view' as never)).allowed) refuse('core.access.denied', 'You do not have permission to see reports about people.', { status: 403 })
  const view = await peopleView(reportId, actor, query)
  if (!view.columns.some(c => c.kind === 'figure' && c.readable)) refuse('reports.run.nothing-readable', 'You cannot see any of this report\'s figures.', { status: 403 })
  const table = await readPeople(actor, view, query.by)
  const question: RunQuestion = { kind: 'people', source: 'saved', report: view.id, name: view.name, columns: view.columns, rowsBy: table.by ?? undefined, filter: null, keyLabels: view.keyLabels, scope: view.scope, period: view.period }
  const id = newId('rpr')
  const at = nowMs()
  const headline: Headline[] = table.totals.flatMap((t, i) => t.state === 'ok' ? [{ measure: table.columns[i]!.id, value: t.amounts.reduce((s, a) => s + a.value, 0) }] : [])
  unit.add({
    sql: "INSERT INTO reports_runs (id, definition_id, question, requested_by, state, rows_count, unavailable, headline, started_at, finished_at, created_at) VALUES (?, ?, ?, ?, 'done', ?, ?, ?, ?, ?, ?)",
    params: [id, view.id, JSON.stringify(question), actor.accountId!, new Set(table.rows.map(r => r.person)).size, JSON.stringify(table.unavailable), JSON.stringify(headline), at, at, at],
  })
  for (const row of table.rows) {
    row.values.forEach((value, i) => {
      if (value === null) return
      unit.add({
        sql: 'INSERT INTO reports_person_rows (id, run_id, account_id, measure, breakdown_value, value) VALUES (?, ?, ?, ?, ?, ?)',
        params: [newId('rpe'), id, row.person, table.columns[i]!.id, row.key ?? null, value],
      })
    })
  }
  unit.audit({ action: 'create', ability: 'reports.people.view', record: [OWNER, id], detail: { report: view.id, people: new Set(table.rows.map(r => r.person)).size } })
  return { id }
}

/** Whether `actor` may open this people copy today: the copy, reports.people.view and each figure's ability (P1, R6). */
export async function mayOpenPeople(actor: Actor, run: Pick<RunRow, 'id' | 'question'>): Promise<boolean> {
  if (!(await can(actor, 'reports.run.view' as never, [OWNER, run.id])).allowed) return false
  const readable = new Set((await listPersonMeasures(actor)).map(m => m.id))
  const question = JSON.parse(run.question) as RunQuestion
  return readable.size > 0 && (question.columns as FigureColumn[]).filter(c => c.readable).every(c => readable.has(c.id))
}

/** A kept copy's table, from its stored rows and today's names. */
export async function peopleCopy(run: RunRow): Promise<PeopleTable | null> {
  if (run.state !== 'done' && run.state !== 'stale') return null
  const question = JSON.parse(run.question) as RunQuestion
  const columns = question.columns as FigureColumn[]
  const stored = await useDb().all<{ account_id: string, measure: string, breakdown_value: string | null, value: number }>(sql`SELECT account_id, measure, breakdown_value, value FROM reports_person_rows WHERE run_id = ${run.id}`)
  const unavailable = JSON.parse(run.unavailable) as Unavailable[]
  const shown = columns.map(c => c.readable && !unavailable.some(u => u.measure === c.id))
  const found = new Map<string, { person: string, key?: string, values: (number | null)[] }>()
  for (const s of stored) {
    const id = `${s.account_id}|${s.breakdown_value ?? ''}`
    const row = found.get(id) ?? { person: s.account_id, ...(s.breakdown_value ? { key: s.breakdown_value } : {}), values: columns.map((_, i) => shown[i] ? 0 : null) }
    const i = columns.findIndex(c => c.id === s.measure)
    if (i >= 0) row.values[i] = (row.values[i] ?? 0) + s.value
    found.set(id, row)
  }
  const headline = new Map((JSON.parse(run.headline ?? '[]') as Headline[]).map(h => [h.measure, h.value]))
  const totals: Shown[] = columns.map((c, i) => !shown[i] ? { state: 'unavailable', reason: c.gone ? 'gone' : 'hidden' } : headline.has(c.id) ? { state: 'ok', amounts: [{ value: headline.get(c.id)! }] } : { state: 'unavailable', reason: 'no-total' })
  return await named(columns, [...found.values()], totals, unavailable, question.rowsBy, question.keyLabels)
}

const csvCell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The people CSV (REP-45, P4): made now from the stored rows and today's names, never stored, audited as an export. */
export async function peopleCsv(unit: UnitView, actor: Actor, id: string): Promise<{ name: string, text: string }> {
  const run = await runById(id)
  const question = run ? JSON.parse(run.question) as RunQuestion : null
  if (!run || question?.kind !== 'people' || !(await mayOpenPeople(actor, run))) return refuse('reports.run.unknown', 'There is no such copy, or you cannot open it.', { status: 404 })
  if (run.state === 'stale') refuse('reports.run.stale', 'People in this copy have been merged since it was made.', { status: 409, remedy: 'Re-run to combine merged people.' })
  const table = await peopleCopy(run)
  if (!table) return refuse('reports.run.no-file', 'This copy has no rows to download.', { status: 409, remedy: 'Make a new copy from the report.' })
  const say = siteWords()
  const shown = table.columns.map((c, i) => ({ c, i })).filter(({ c }) => c.shown)
  const head = [say('reports.people.name'), ...(table.by ? [table.byLabel ?? table.by] : []), ...shown.map(({ c }) => c.unit === 'minutes' ? say('reports.csv.minutes', { figure: say(c.label) }) : say(c.label))]
  const lines: (string | number | null | undefined)[][] = [
    ['key' in question.name ? say(question.name.key) : question.name.text],
    [say('reports.people.personal-data')],
    [say('reports.csv.question'), `${question.scope.title ? `${question.scope.title}, ` : ''}${question.period.from} to ${question.period.to}`],
    [],
    head,
    ...table.rows.map(r => [r.name, ...(table.by ? [r.keyLabel ?? r.key ?? ''] : []), ...shown.map(({ i }) => r.values[i])]),
    [say('reports.total'), ...(table.by ? [''] : []), ...shown.map(({ i }) => {
      const t = table.totals[i]!
      return t.state === 'ok' ? t.amounts.reduce((s, a) => s + a.value, 0) : ''
    })],
  ]
  unit.audit({ action: 'export', ability: 'reports.people.export', record: [OWNER, id], detail: { people: run.rows_count ?? 0 } })
  return { name: `people-${question.period.from}-to-${question.period.to}.csv`, text: `${lines.map(l => l.map(csvCell).join(',')).join('\r\n')}\r\n` }
}

/** Rule P7: every copy holding the merged-away person is marked stale, before core moves the rows. */
export function staleOnMerge(unit: UnitView, ref: MergeRef): undefined {
  unit.add(sql`UPDATE reports_runs SET state = 'stale' WHERE state = 'done' AND id IN (SELECT run_id FROM reports_person_rows WHERE ${exactAccount(sql.identifier('account_id'), ref.mergedAccountId)})`) // exact-account: the merged-away account's own rows, before core moves them
  return undefined
}

/** Rule P5: people copies past reports.people.keep-for lose their rows and become expired. */
export async function expirePeople(): Promise<void> {
  const keepFor = await useSetting('reports.people.keep-for') as number
  const before = nowMs() - keepFor * 1000 // not-policy: seconds to milliseconds
  const unit = createUnit()
  unit.add({ sql: "UPDATE reports_runs SET state = 'expired' WHERE state IN ('done', 'stale') AND json_extract(question, '$.kind') = 'people' AND finished_at < ?", params: [before] })
  unit.add({ sql: "DELETE FROM reports_person_rows WHERE run_id IN (SELECT id FROM reports_runs WHERE state = 'expired' AND json_extract(question, '$.kind') = 'people')", params: [] })
  await unit.commit()
}

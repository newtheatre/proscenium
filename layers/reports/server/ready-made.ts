// Ready-made reports (rules K1 to K3) and the dates a report covers. A report lists only when its
// module is on and the reader holds its ability; each figure is still checked when it is read.
import { can, log, nowMs, refuse, usePoint, useSetting, type Actor, type MeasureScope } from '#kit'
import { getProduction, getVenue, listMeasures, listPerformances, listSeasons, operatingDayOf, type MeasureListing } from '#modules/core'
import { keyLabels, nameable } from './keys'
import type { FigureColumn, PeriodRule, ReadyMade, ReportColumn, ReportView, ScopeKind } from '../shared/reports'
import { previousDate } from '#kit/clock'

const WEEK_STARTS = { monday: 1, sunday: 0, saturday: 6 } as const // not-policy: days of the week

/** Every ready-made report from a module that is on, whose figures are declared and whose author may present them (K3). */
export async function readyMadeReports(): Promise<{ report: ReadyMade, module: string }[]> {
  const figures = new Map((await listMeasures(null)).map(m => [m.id, m]))
  const out: { report: ReadyMade, module: string }[] = []
  for (const { module, value } of await usePoint<ReadyMade>('reports.report')) {
    const unknown = value.figures.filter(id => !figures.has(id))
    const othersOnly = module !== 'reports' && value.figures.every(id => figures.get(id)?.module !== module)
    if (unknown.length || othersOnly) {
      log.error('reports.report.refused', { report: value.id, module, reason: unknown.length ? 'unknown-figure' : 'other-modules-only' })
      continue
    }
    out.push({ report: value, module })
  }
  return out.sort((a, b) => a.report.area.localeCompare(b.report.area) || (a.report.order ?? 0) - (b.report.order ?? 0) || a.report.id.localeCompare(b.report.id))
}

/** The ready-made reports this reader may open: reports.report.view and the report's own ability. */
export async function readyMadeFor(actor: Actor): Promise<{ report: ReadyMade, module: string }[]> {
  if (!(await can(actor, 'reports.report.view' as never)).allowed) return []
  const out = []
  for (const entry of await readyMadeReports()) if ((await can(actor, entry.report.ability as never)).allowed) out.push(entry)
  return out
}

export interface ViewQuery { scope?: { kind: ScopeKind, id: string } | null, period?: PeriodRule, from?: string, to?: string }

/** A ready-made report as the page draws it: its figures, the breakdowns they share and its dates. */
export async function reportView(id: string, actor: Actor, query: ViewQuery): Promise<ReportView> {
  const found = (await readyMadeFor(actor)).find(r => r.report.id === id) ?? refuse('reports.report.unknown', 'There is no such report, or you cannot open it.', { status: 404 })
  const { report, module } = found
  const columns = await figureColumns(report.figures, actor)
  const base = await viewBase(columns, actor, query, { scopeKind: report.scope, periodRule: report.period })
  return {
    ...base, source: 'ready-made', kind: 'figures', id: report.id, name: { key: report.label }, description: { key: report.description }, module,
    usualBy: report.breakdown ?? null, chart: report.chart ?? null, acrossBy: null, filter: null, saved: null,
  }
}

/** Figure columns for measure ids, each marked readable or not; one no module offers now is marked gone (D3). */
export async function figureColumns(ids: string[], actor: Actor): Promise<FigureColumn[]> {
  const all = new Map((await listMeasures(null)).map(m => [m.id, m]))
  const readable = new Set((await listMeasures(actor)).map(m => m.id))
  return ids.map(fid => all.has(fid)
    ? column(all.get(fid)!, readable.has(fid))
    : { kind: 'figure', id: fid, label: 'reports.figure-gone', unit: 'count', combine: 'sum', by: [], filters: [], readable: false, gone: true })
}

/** What every view shares: the breakdowns its readable figures allow, the scope and the dates. */
export async function viewBase(columns: ReportColumn[], actor: Actor, query: ViewQuery, usual: { scopeKind: ScopeKind, periodRule: PeriodRule }) {
  const shown = columns.filter((c): c is FigureColumn => c.kind === 'figure' && c.readable)
  const candidates = shown.length ? shown[0]!.by.filter(k => shown.every(f => f.by.includes(k))) : []
  const breakdowns: string[] = []
  for (const k of candidates) if (await nameable(k)) breakdowns.push(k)
  const kind = query.scope?.kind ?? usual.scopeKind
  const scope = { kind, id: query.scope?.id ?? null, title: query.scope ? await scopeTitle(query.scope.kind, query.scope.id) : null }
  const rule = query.period ?? usual.periodRule
  const period = await viewPeriod(rule, query, scope)
  const mayCreate = (await can(actor, 'reports.report.create' as never)).allowed
  return { columns, breakdowns, mayCreate, keyLabels: await keyLabels(breakdowns), scopeKind: usual.scopeKind, periodRule: usual.periodRule, period: { rule, ...period }, scope }
}

/** The dates a view shows: the rule's own, or today until the page has what the rule needs. */
async function viewPeriod(rule: PeriodRule, query: ViewQuery, scope: { kind: ScopeKind, id: string | null }): Promise<{ from: string, to: string }> {
  // Until the record is chosen, "all of it" has no dates of its own: the page asks for the record first.
  if (rule === 'scope' && scope.kind !== 'none' && !scope.id) {
    const today = await operatingDayOf(nowMs())
    return { from: today, to: today }
  }
  // Chosen dates not yet chosen start as last month's, for the page to change.
  const unchosen = rule === 'chosen' && !query.from && !query.to
  return await periodOf(unchosen ? 'last-month' : rule, query)
}

const column = (m: MeasureListing, readable: boolean): FigureColumn => ({ kind: 'figure', id: m.id, label: m.label, unit: m.unit, combine: m.combine, by: m.by, filters: m.filters, readable })

export async function scopeTitle(kind: ScopeKind, id: string): Promise<string | null> {
  if (kind === 'production') return (await getProduction(id)).title
  if (kind === 'season') return (await listSeasons()).find(s => s.id === id)?.name ?? refuse('reports.scope.unknown', 'There is no such season.', { status: 404 })
  if (kind === 'venue') return (await getVenue(id)).name
  return null
}

/** The scope as readMeasure takes it. */
export function measureScope(scope: ViewQuery['scope']): MeasureScope | undefined {
  if (!scope || scope.kind === 'none') return undefined
  return { [scope.kind]: scope.id } as MeasureScope
}

/** A period rule's show nights, first and last, in the theatre's days. */
export async function periodOf(rule: PeriodRule, query: ViewQuery): Promise<{ from: string, to: string }> {
  const today = await operatingDayOf(nowMs())
  if (rule === 'chosen') {
    if (!query.from || !query.to || query.to < query.from) refuse('reports.period.chosen', 'Choose a first and a last date, the last on or after the first.', { status: 422, fields: { to: 'On or after the first date.' } })
    return { from: query.from!, to: query.to! }
  }
  if (rule === 'scope') return await scopeDates(query.scope, today)
  if (rule === 'last-month') {
    const first = `${today.slice(0, 7)}-01` // not-policy: the first of this month
    const end = previousDate(first)
    return { from: `${end.slice(0, 7)}-01`, to: end } // not-policy: the first of last month
  }
  if (rule === 'last-week') {
    const start = WEEK_STARTS[await useSetting('core.organisation.week-start') as keyof typeof WEEK_STARTS] ?? 1
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
    const thisWeek = previousDate(today, (weekday - start + 7) % 7) // not-policy: days in a week
    return { from: previousDate(thisWeek, 7), to: previousDate(thisWeek) } // not-policy: days in a week
  }
  return committeeYear(today, rule === 'last-committee-year')
}

async function scopeDates(scope: ViewQuery['scope'], today: string): Promise<{ from: string, to: string }> {
  if (scope?.kind === 'production') {
    const days = (await listPerformances({ productionId: scope.id })).map(p => p.operatingDay).sort()
    return days.length ? { from: days[0]!, to: days.at(-1)! } : { from: today, to: today }
  }
  if (scope?.kind === 'season') {
    const season = (await listSeasons()).find(s => s.id === scope.id) ?? refuse('reports.scope.unknown', 'There is no such season.', { status: 404 })
    return { from: season.startsOn, to: season.endsOn }
  }
  return committeeYear(today, false)
}

const yearOf = (date: string): number => Number(date.slice(0, 4)) // not-policy: the year part of an ISO date

async function committeeYear(today: string, last: boolean): Promise<{ from: string, to: string }> {
  const end = await useSetting('core.organisation.year-end') as string | null
  if (!end) refuse('reports.period.no-year-end', 'The theatre\'s year end has not been set.', { status: 409, remedy: 'An admin sets it in Admin, on the Theatre page.' })
  const year = yearOf(today)
  const endsThisYear = `${year}-${end}`
  const ends = today <= endsThisYear ? endsThisYear : `${year + 1}-${end}`
  const to = last ? `${yearOf(ends) - 1}-${end}` : ends
  return { from: previousDate(`${yearOf(to) - 1}-${end}`, -1), to }
}

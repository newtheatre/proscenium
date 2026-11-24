// Reads a report's figures live, in parallel, for the page (rule R1): each readable figure once by
// the chosen breakdown and once for its total, because a distinct or level figure's total is never
// the sum of its rows (M6). Nothing is kept.
import type { FigureAnswer, FigureColumn, PageBreakdown, ReportView } from '../../shared/reports'

export interface Amount { value: number, currency?: string }
export interface Cell { state: 'ok', amounts: Amount[] }
export type Shown = Cell | { state: 'unavailable', reason: string } | { state: 'unsupported' }
export interface ReportRow { key: string, label: string, sortBy: string | number, cells: Record<string, Shown> }

const amountsOf = (rows: Extract<FigureAnswer, { state: 'ok' }>['rows']): Amount[] =>
  rows.map(r => ({ value: r.value, ...(r.currency ? { currency: r.currency } : {}) }))

export function useReportFigures(view: Ref<ReportView | undefined | null>, by: Ref<PageBreakdown | undefined>) {
  const { $api } = useNuxtApp()
  const { dayNamed, dateTime, monthYear } = useDates()

  const ready = computed(() => !!view.value && (view.value.report.scope === 'none' || !!view.value.scope.id))
  const shown = computed<FigureColumn[]>(() => (view.value?.figures ?? []).filter(f => f.readable))
  const question = computed(() => view.value && ready.value
    ? { from: view.value.period.from, to: view.value.period.to, ...(view.value.scope.id ? { scope: `${view.value.scope.kind}:${view.value.scope.id}` } : {}) }
    : null)

  const read = (id: string, withBy: boolean) => $api<FigureAnswer>('/api/reports/figures', { query: { id, ...question.value, ...(withBy && by.value ? { by: by.value } : {}) } })
  const { data, status, error, refresh } = useAsyncData(
    () => `reports:figures:${view.value?.report.id}:${JSON.stringify(question.value)}:${by.value ?? ''}`,
    async () => {
      if (!question.value) return null
      const ids = shown.value.map(f => f.id)
      const [rows, totals] = await Promise.all([
        by.value ? Promise.all(ids.map(id => read(id, true))) : Promise.resolve(ids.map(() => null)),
        Promise.all(ids.map(id => read(id, false))),
      ])
      return Object.fromEntries(ids.map((id, i) => [id, { rows: rows[i], total: totals[i]! }]))
    },
    { watch: [question, by] },
  )

  const visible = computed(() => shown.value.filter(f => data.value?.[f.id]?.total.state !== 'hidden'))
  // Left out for the reader: no ability anywhere, or none on this scope (M3).
  const hidden = computed(() => (view.value?.figures.length ?? 0) - visible.value.length)

  const totals = computed<Record<string, Shown>>(() => Object.fromEntries(visible.value.map((f) => {
    const answer = data.value?.[f.id]?.total
    return [f.id, toShown(answer)]
  })))

  const rows = computed<ReportRow[]>(() => {
    if (!by.value || !data.value) return []
    const out = new Map<string, ReportRow>()
    for (const f of visible.value) {
      const answer = data.value[f.id]?.rows
      if (!answer || answer.state !== 'ok') continue
      for (const r of answer.rows) {
        const key = r.keys[by.value] ?? ''
        const row = out.get(key) ?? { key, label: labelOf(key, answer), sortBy: sortOf(key, answer), cells: {} }
        const cell = row.cells[f.id] as Cell | undefined
        row.cells[f.id] = { state: 'ok', amounts: [...(cell?.amounts ?? []), ...amountsOf([r])] }
        out.set(key, row)
      }
    }
    // A figure that answered nothing for a row has nought there; one that could not answer is told as such.
    for (const row of out.values()) {
      for (const f of visible.value) {
        const answer = data.value[f.id]?.rows
        if (!row.cells[f.id]) row.cells[f.id] = answer && answer.state !== 'ok' ? toShown(answer) : { state: 'ok', amounts: f.unit === 'money' ? [] : [{ value: 0 }] }
      }
    }
    return [...out.values()].sort((a, b) => a.sortBy < b.sortBy ? -1 : a.sortBy > b.sortBy ? 1 : 0)
  })

  function labelOf(key: string, answer: Extract<FigureAnswer, { state: 'ok' }>): string {
    if (by.value === 'day') return dayNamed(key)
    if (by.value === 'month') return monthYear(`${key}-01`)
    const title = answer.labels[key] ?? key
    const starts = answer.starts?.[key]
    return starts ? `${title}, ${dateTime(starts)}` : title
  }
  const sortOf = (key: string, answer: Extract<FigureAnswer, { state: 'ok' }>) => answer.starts?.[key] ?? (by.value === 'day' || by.value === 'month' ? key : labelOf(key, answer).toLowerCase())

  return { ready, visible, hidden, totals, rows, status, error, refresh }
}

function toShown(answer: FigureAnswer | null | undefined): Shown {
  if (!answer || answer.state === 'hidden') return { state: 'unavailable', reason: 'hidden' }
  if (answer.state === 'ok') return { state: 'ok', amounts: amountsOf(answer.rows) }
  return answer
}
